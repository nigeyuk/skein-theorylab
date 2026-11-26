import { BlobReader, BlobWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'
import type { FileEntry } from '@zip.js/zip.js'
import { readJson, sha256, validateFile } from './files'
import {
  ContentError, choice, digest, identifier, integer, limits, mediaTypes, object, parseContent, supportedTypes, text,
} from './model'
import type { LibraryEntry, MediaType, SupportedType } from './model'

const manifestPath = 'manifest.json'
const pathFor = (hash: string) => 'files/' + hash

interface PackFile {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
  readonly mediaType: MediaType
}

function parsePackFile(value: unknown): PackFile {
  const input = object(value, 'Pack file')
  const hash = digest(input.sha256)
  if (input.path !== pathFor(hash)) throw new ContentError('The manifest declares an unsafe or non-canonical asset path.')
  return { sha256: hash, path: pathFor(hash), bytes: integer(input.bytes, 'Asset size', 1, limits.fileBytes),
    mediaType: choice(input.mediaType, mediaTypes, 'Media type') }
}

function parseManifest(value: unknown) {
  const input = object(value, 'Pack manifest')
  if (input.formatVersion !== 1) throw new ContentError('Unsupported .skeinpack format version.')
  identifier(input.packId, 'Pack ID')
  integer(input.packRevision, 'Pack revision', 1)
  const title = text(input.title, 'Pack title')
  const kind = choice(input.kind, ['collection', 'library'] as const, 'Pack kind')
  if (!Array.isArray(input.resources) || !input.resources.length || input.resources.length > limits.packEntries - 1
    || !Array.isArray(input.files) || !input.files.length || input.files.length > limits.packEntries - 1) {
    throw new ContentError('The manifest must contain up to 128 resources and 128 files.')
  }
  const files = new Map<string, PackFile>()
  for (const value of input.files) {
    const file = parsePackFile(value)
    if (files.has(file.path)) throw new ContentError('The manifest repeats an asset path.')
    files.set(file.path, file)
  }
  const ids = new Set<string>()
  const resources = input.resources.map((value: unknown) => {
    const record = parseContent(value)
    if (!supportedTypes.includes(record.type as SupportedType)) throw new ContentError('This pack contains a resource type reserved for a future release.')
    if (ids.has(record.id)) throw new ContentError('The manifest repeats a resource ID.')
    ids.add(record.id)
    const favourite = kind === 'library' && object(value, 'Resource').favourite === true
    return { record, favourite }
  })
  return { title, files, resources }
}

async function extract(entry: FileEntry, max: number, media = '') {
  if (entry.uncompressedSize > max) throw new ContentError(entry.filename + ' exceeds its size limit.')
  const blocks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  const writer = new WritableStream<Uint8Array>({
    write(block) {
      size += block.byteLength
      if (size > max || size > entry.uncompressedSize) throw new ContentError('A ZIP entry expands beyond its declared size.')
      blocks.push(new Uint8Array(block))
    },
  })
  await entry.getData(writer, { checkCrc32: true, checkOverlappingEntry: true, useWebWorkers: false })
  if (size !== entry.uncompressedSize) throw new ContentError('A ZIP entry has an incorrect uncompressed size.')
  return new Blob(blocks, { type: media })
}

export async function readContentPack(archive: Blob): Promise<{ title: string; entries: LibraryEntry[] }> {
  if (!archive.size || archive.size > limits.archiveBytes) throw new ContentError('A .skeinpack ZIP must be non-empty and no larger than 48 MiB.')
  const reader = new ZipReader(new BlobReader(archive), { strictness: 'strict', filenameValidation: 'strict' })
  try {
    const entries = new Map<string, FileEntry>()
    let expanded = 0
    for await (const entry of reader.getEntriesGenerator()) {
      if (entries.size === limits.packEntries) throw new ContentError('The ZIP contains too many entries.')
      const path = entry.filename
      const unixType = ((entry.externalFileAttributes ?? 0) >>> 16) & 0xf000
      if (entry.directory || entry.encrypted || (unixType && unixType !== 0x8000)
        || (path !== manifestPath && !/^files\/[a-f0-9]{64}$/.test(path))
        || new TextDecoder().decode(entry.rawFilename) !== path || entries.has(path)
        || (entry.compressionMethod !== 0 && entry.compressionMethod !== 8)) {
        throw new ContentError('The ZIP contains an unsafe, duplicate or unsupported entry.')
      }
      expanded += entry.uncompressedSize
      const max = path === manifestPath ? limits.textBytes : limits.fileBytes
      if (!entry.uncompressedSize || entry.uncompressedSize > max || expanded > limits.expandedBytes
        || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 250) {
        throw new ContentError('The ZIP exceeds the allowed size or expansion ratio.')
      }
      entries.set(path, entry)
    }
    const manifestEntry = entries.get(manifestPath)
    if (!manifestEntry) throw new ContentError('The pack is missing manifest.json.')
    const manifest = parseManifest(await readJson(await extract(manifestEntry, limits.textBytes)))
    if (entries.size !== manifest.files.size + 1) throw new ContentError('The archive entries do not match the manifest.')
    const payloads = new Map<string, Blob>()
    const referenced = new Set<string>()
    const result: LibraryEntry[] = []
    for (const { record, favourite } of manifest.resources) {
      const files: [string, Blob][] = []
      for (const file of record.files) {
        const path = pathFor(file.sha256)
        const expected = manifest.files.get(path)
        const entry = entries.get(path)
        if (!expected || !entry || expected.bytes !== file.size || expected.mediaType !== file.mediaType
          || entry.uncompressedSize !== expected.bytes) throw new ContentError('A resource file does not match the manifest.')
        let blob = payloads.get(path)
        if (!blob) {
          blob = await extract(entry, expected.bytes, expected.mediaType)
          if (await sha256(blob) !== expected.sha256) throw new ContentError('Asset integrity check failed for ' + file.name + '.')
          await validateFile(blob, expected.mediaType)
          payloads.set(path, blob)
        }
        referenced.add(path)
        files.push([file.id, blob])
      }
      result.push({ record, favourite, origin: 'imported', assets: Object.fromEntries(files) })
    }
    if (referenced.size !== manifest.files.size) throw new ContentError('The pack declares files that no resource uses.')
    return { title: manifest.title, entries: result }
  } catch (error) {
    if (error instanceof ContentError) throw error
    throw new ContentError('Invalid ZIP archive. Check its paths, checksums and compression format.')
  } finally {
    await reader.close()
  }
}

export async function writeContentPack(entries: readonly LibraryEntry[], title: string, backup = false): Promise<Blob> {
  const packTitle = text(title, 'Pack title')
  if (!entries.length || entries.length > limits.packEntries - 1) throw new ContentError('Export between 1 and 128 resources.')
  const assets = new Map<string, { descriptor: PackFile; blob: Blob }>()
  let size = 0
  for (const { record, assets: resources } of entries) {
    for (const file of record.files) {
      const blob = resources[file.id]
      if (!blob || blob.size !== file.size) throw new ContentError('An asset is missing or unreadable.')
      const path = pathFor(file.sha256)
      const existing = assets.get(path)
      if (existing) {
        if (existing.descriptor.mediaType !== file.mediaType) throw new ContentError('The same payload has inconsistent media types.')
        continue
      }
      size += blob.size
      if (assets.size >= limits.packEntries - 1 || size > limits.archiveBytes - limits.textBytes) {
        throw new ContentError('Export a smaller collection. Packs are limited to 48 MiB and 128 files.')
      }
      if (await sha256(blob) !== file.sha256) throw new ContentError('Asset integrity check failed for ' + file.name + '.')
      assets.set(path, { descriptor: { path, bytes: file.size, mediaType: file.mediaType, sha256: file.sha256 }, blob })
    }
  }
  const manifest = new Blob([JSON.stringify({
    formatVersion: 1, packId: crypto.randomUUID(), packRevision: 1, title: packTitle, kind: backup ? 'library' : 'collection',
    resources: entries.map(({ record, favourite }) => backup ? { ...record, favourite } : record),
    files: [...assets.values()].map(({ descriptor }) => descriptor),
  }, null, 2)], { type: 'application/json' })
  if (manifest.size > limits.textBytes) throw new ContentError('The exported manifest exceeds 1 MiB.')
  const writer = new ZipWriter(new BlobWriter('application/zip'), { level: 0, useWebWorkers: false })
  await writer.add(manifestPath, new BlobReader(manifest))
  for (const [path, { blob }] of assets) await writer.add(path, new BlobReader(blob))
  return writer.close()
}
