import { BlobReader, BlobWriter, ZipWriter } from '@zip.js/zip.js'
import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { parseExercise, sha256, validateFile } from '../src/content/files'
import { createContentLibrary, searchLibrary } from '../src/content/library'
import { limits, parseContent, parseMediaType } from '../src/content/model'
import type { LibraryEntry } from '../src/content/model'
import { contentPackExtension, isContentPackFilename, readContentPack, writeContentPack } from '../src/content/pack'
import { applyLibraryMutations } from '../src/content/repository'
import type { ContentRepository } from '../src/content/repository'
import { createIndexedDbContentRepository } from '../src/storage/indexeddb-content'

const pdf = (name = 'Intervals.pdf', text = 'test PDF') => new File(['%PDF-1.7\n' + text], name)
const markdown = (name = 'Welcome.md', text = '# Welcome to MyTheoryLab') => new File([text], name)

function inMemory() {
  const entries = new Map<string, LibraryEntry>()
  const repository: ContentRepository = {
    list: vi.fn(async () => [...entries.values()]),
    get: vi.fn(async (id) => entries.get(id)),
    commit: vi.fn(async (changes) => {
      for (const [id, entry] of applyLibraryMutations([...entries.values()], changes)) {
        if (entry) entries.set(id, entry)
        else entries.delete(id)
      }
    }),
  }
  return { repository, library: createContentLibrary(repository) }
}

async function entryFor(file = pdf()) {
  const { library } = inMemory()
  return (await library.prepareFiles([file]))[0]!.entry
}

async function makeZip(files: readonly { name: string; blob: Blob; attributes?: number }[], level = 0) {
  const writer = new ZipWriter(new BlobWriter(), { level, useWebWorkers: false })
  for (const { name, blob, attributes } of files) {
    await writer.add(name, new BlobReader(blob), { externalFileAttributes: attributes })
  }
  return writer.close()
}

async function forgedPack(entry: LibraryEntry, blob: Blob) {
  const asset = entry.record.files[0]!
  const path = 'files/' + asset.sha256
  return makeZip([
    { name: 'manifest.json', blob: new Blob([JSON.stringify({
      formatVersion: 1, packId: 'fixture', packRevision: 1, title: 'Fixture', kind: 'collection', resources: [entry.record],
      files: [{ path, bytes: asset.size, sha256: asset.sha256, mediaType: asset.mediaType }],
    })]) },
    { name: path, blob },
  ])
}

describe('content schema and file imports', () => {
  it('creates versioned local metadata with durable IDs and a file digest', async () => {
    const entry = await entryFor()
    const file = entry.record.files[0]!
    expect(entry.record).toMatchObject({
      schemaVersion: 1, title: 'Intervals', type: 'pdf', revision: 1, ownerId: 'local', visibility: 'private', status: 'draft',
    })
    expect(file.sha256).toBe(await sha256(entry.assets[file.id]!))
    expect(parseContent(entry.record)).toEqual(entry.record)
    expect(parseContent({ ...entry.record, difficulty: 'advanced', relatedResourceIds: ['answers'] }).difficulty).toBe('advanced')
  })

  it.each([
    { schemaVersion: 2 }, { revision: 0 }, { id: '../escape' }, { type: 'audio' }, { visibility: 'hidden' },
    { updatedAt: '1990-01-01T00:00:00.000Z' }, { tags: 'tag' }, { title: ' ' },
  ])('rejects invalid metadata %j', async (patch) => {
    const { record } = await entryFor()
    expect(() => parseContent({ ...record, ...patch })).toThrow()
  })

  it('validates three document types and rejects unsupported or disguised assets', async () => {
    const { library } = inMemory()
    const exercise = new File([JSON.stringify({
      schemaVersion: 1, questions: [{ kind: 'multiple-choice', id: 'q1', prompt: 'Pick C', choices: ['C', 'D'], answer: 0 }],
    })], 'Scale.json')
    const preview = await library.prepareFiles([pdf(), markdown(), exercise])
    expect(preview.map(({ entry }) => entry.record.type)).toEqual(['pdf', 'markdown', 'exercise'])
    await expect(library.prepareFiles([new File(['<svg/>'], 'fake.png')])).rejects.toThrow('Invalid PNG')
    await expect(library.prepareFiles([new File(['<svg/>'], 'diagram.svg')])).rejects.toThrow('Unsupported file')
    await expect(library.prepareFiles([new File(['<script/>'], 'fake.pdf')])).rejects.toThrow('Invalid PDF')
    await expect(library.prepareFiles([new File(['{"schemaVersion":1,"questions":[]}'], 'broken.json')])).rejects.toThrow('1–100')
    expect(() => parseExercise({ schemaVersion: 1, questions: [{ kind: 'script', id: 'q', prompt: 'Anything' }] })).toThrow()
  })

  it('allows raster images with bounded dimensions', async () => {
    const data = new Uint8Array(24)
    const header = new DataView(data.buffer)
    header.setUint32(0, 0x89504e47)
    header.setUint32(4, 0x0d0a1a0a)
    header.setUint32(8, 13)
    header.setUint32(12, 0x49484452)
    header.setUint32(16, 100)
    header.setUint32(20, 100)
    await expect(validateFile(new Blob([data]), 'image/png')).resolves.toBeUndefined()
    header.setUint32(16, 1_000_000)
    await expect(validateFile(new Blob([data]), 'image/png')).rejects.toThrow('dimensions')
  })
})

describe('repository-neutral catalogue and IndexedDB', () => {
  it('persists metadata, blob bytes and favourites across two instances and cleans up on deletion', async () => {
    const factory = new IDBFactory()
    const first = createContentLibrary(createIndexedDbContentRepository('skein-theorylab-content', factory))
    const candidates = await first.prepareFiles([pdf()])
    await first.apply(candidates)
    const id = candidates[0]!.entry.record.id
    await first.setFavourite(id, true)
    const second = createContentLibrary(createIndexedDbContentRepository(undefined, factory))
    const item = (await second.list())[0]!
    expect(item).toMatchObject({ favourite: true, record: { id } })
    const entry = await second.get(id)
    expect(await entry?.assets[item.record.files[0]!.id]?.text()).toContain('%PDF-1.7')
    await second.remove(item.record)
    expect(await first.get(id)).toBeUndefined()
  })

  it('uses an alternate repository and keeps versions, file IDs and favourites through replacement', async () => {
    const { library, repository } = inMemory()
    const pending = await library.prepareFiles([pdf()])
    const item = pending[0]!.entry
    await library.apply(pending)
    await library.setFavourite(item.record.id, true)
    await library.update(item, { ...item.record, category: 'Practice', tags: ['thirds'], type: 'worksheet' }, pdf('Practice.pdf', 'new file'))
    const updated = (await library.get(item.record.id))!
    expect(updated).toMatchObject({ favourite: true, record: { id: item.record.id, revision: 2, files: [{ id: item.record.files[0]!.id }] } })
    expect(repository.commit).toHaveBeenCalledTimes(3)
    expect(searchLibrary(await library.list(), { query: 'interval thirds', type: 'worksheet', category: 'Practice', tag: 'thirds', favouritesOnly: true })).toHaveLength(1)
    expect(searchLibrary(await library.list(), { category: 'Wrong category' })).toEqual([])
    await expect(library.update(item, item.record)).rejects.toThrow('library changed')
    await expect(library.update(updated, updated.record, markdown())).rejects.toThrow('primary file')
  })

  it('detects duplicate content across IDs and handles stale, newer or differing version imports', async () => {
    const { library } = inMemory()
    const first = (await library.prepareFiles([pdf()]))[0]!
    const { entry } = first
    await library.apply([first])
    const variants = await library.preview([
      { ...entry, record: { ...entry.record, id: 'other-id' } },
      { ...entry, record: { ...entry.record, title: 'Changed at same version' } },
    ])
    expect(variants.map(({ action }) => action)).toEqual(['duplicate', 'conflict'])
    const incoming = await library.preview([{ ...entry, record: { ...entry.record, revision: 2, title: 'Updated' } }])
    expect(incoming[0]?.action).toBe('update')
    expect(await library.apply(incoming)).toBe(0)
    expect(await library.apply(incoming, true)).toBe(1)
    expect((await library.preview([entry]))[0]?.action).toBe('conflict')
  })

  it('rejects a concurrent duplicate transaction atomically', async () => {
    const repository = createIndexedDbContentRepository('atomic', new IDBFactory())
    const library = createContentLibrary(repository)
    const a = await library.prepareFiles([pdf()])
    const b = await library.prepareFiles([markdown(), pdf('Other.pdf')])
    await library.apply(a)
    await expect(library.apply(b)).rejects.toThrow('already belongs')
    expect((await library.list()).map(({ record }) => record.type)).toEqual(['pdf'])
  })
})

describe('MyTheoryLab content packs', () => {
  it('recognises the current and legacy filename extensions without broadening file matching', () => {
    expect(contentPackExtension).toBe('.mytheorypack')
    expect(isContentPackFilename('Library.MYTHEORYPACK')).toBe(true)
    expect(isContentPackFilename('Library.SKEINPACK')).toBe(true)
    expect(isContentPackFilename('Library.mytheorypack.txt')).toBe(false)
  })

  it('normalises the previous reserved score media type', () => {
    expect(parseMediaType('application/vnd.skein.score+json')).toBe('application/vnd.mytheorylab.score+json')
  })

  it('round-trips individual resources, collections and library favourites', async () => {
    const first = await entryFor()
    const second = { ...(await entryFor(markdown())), favourite: true }
    const collection = await readContentPack(await writeContentPack([first, second], 'Study pack'))
    expect(collection.title).toBe('Study pack')
    expect(collection.entries.map(({ record }) => record)).toEqual([first.record, second.record])
    expect(collection.entries[1]?.favourite).toBe(false)
    const backup = await readContentPack(await writeContentPack([second], 'Backup', true))
    expect(backup.entries[0]).toMatchObject({ favourite: true, origin: 'imported', record: { id: second.record.id } })
    const { library } = inMemory()
    expect(await library.apply(await library.preview(backup.entries))).toBe(1)
  })

  it('rejects wrong versions, missing manifests and non-ZIP files', async () => {
    const badVersion = await makeZip([{ name: 'manifest.json', blob: new Blob(['{"formatVersion":2}']) }])
    await expect(readContentPack(badVersion)).rejects.toThrow('Unsupported content pack format')
    const badKind = await makeZip([{ name: 'manifest.json', blob: new Blob([JSON.stringify({
      formatVersion: 1, packId: 'fixture', packRevision: 1, title: 'Fixture', kind: 'unknown',
    })]) }])
    await expect(readContentPack(badKind)).rejects.toThrow('Pack kind')
    const missing = await makeZip([{ name: 'files/' + 'a'.repeat(64), blob: new Blob(['x']) }])
    await expect(readContentPack(missing)).rejects.toThrow('missing manifest')
    await expect(readContentPack(new Blob(['junk']))).rejects.toThrow('Invalid ZIP')
  })

  it('rejects tampered checksums and entries with unsafe paths or symlink attributes', async () => {
    const entry = await entryFor()
    const size = entry.record.files[0]!.size
    await expect(readContentPack(await forgedPack(entry, new Blob(['A'.repeat(size)])))).rejects.toThrow('integrity')
    const named = await makeZip([{ name: 'safe.txt', blob: new Blob(['x']) }])
    const bytes = new Uint8Array(await named.arrayBuffer())
    const oldName = new TextEncoder().encode('safe.txt')
    const badName = new TextEncoder().encode('../a.txt')
    for (let index = 0; index < bytes.length - oldName.length; index++) {
      if (oldName.every((value, offset) => value === bytes[index + offset])) bytes.set(badName, index)
    }
    await expect(readContentPack(new Blob([bytes]))).rejects.toThrow(/paths|unsafe/i)
    const symbolic = await makeZip([{ name: 'manifest.json', blob: new Blob(['{}']), attributes: 0xa1ff0000 }])
    await expect(readContentPack(symbolic)).rejects.toThrow(/unsafe/i)
  })

  it('rejects oversized archives and excessive expansion before accepting payloads', async () => {
    const bomb = await makeZip([{ name: 'manifest.json', blob: new Blob(['a'.repeat(100_000)]) }], 6)
    await expect(readContentPack(bomb)).rejects.toThrow('expansion ratio')
    await expect(readContentPack({ size: limits.archiveBytes + 1 } as Blob)).rejects.toThrow('48 MiB')
  })
})
