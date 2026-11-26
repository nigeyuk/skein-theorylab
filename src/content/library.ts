import { fileType, sha256, validateFile } from './files'
import { ContentError, contentFingerprint, limits, parseAsset, parseContent } from './model'
import type { ContentMetadata, ContentType, LibraryEntry, LibraryItem } from './model'
import type { ContentRepository, LibraryMutation } from './repository'

export interface LibraryFilters {
  readonly query?: string
  readonly type?: ContentType
  readonly category?: string
  readonly tag?: string
  readonly favouritesOnly?: boolean
}

export function searchLibrary(items: readonly LibraryItem[], filters: LibraryFilters) {
  const query = filters.query?.toLowerCase().trim().split(/\s+/).filter(Boolean) ?? []
  return items.filter(({ record, favourite }) => {
    const text = [record.title, record.description, record.author, record.subject, record.category, ...record.tags]
      .join(' ').toLowerCase()
    return (!filters.type || filters.type === record.type)
      && (!filters.category || filters.category === record.category)
      && (!filters.tag || record.tags.includes(filters.tag))
      && (!filters.favouritesOnly || favourite)
      && query.every((word) => text.includes(word))
  }).sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt) || a.record.title.localeCompare(b.record.title))
}

export interface ImportCandidate {
  readonly entry: LibraryEntry
  readonly action: 'new' | 'duplicate' | 'update' | 'conflict'
  readonly expectedRevision: number | null
  readonly reason: string
}

export function previewLibraryImport(existing: readonly LibraryItem[], entries: readonly LibraryEntry[]): ImportCandidate[] {
  const fingerprints = new Map(existing.map(({ record }) => [contentFingerprint(record), record.id]))
  const byId = new Map(existing.map((item) => [item.record.id, item]))
  const seen = new Set<string>()
  return entries.map((entry) => {
    const { record } = entry
    const current = byId.get(record.id)
    const expectedRevision = current?.record.revision ?? null
    const fingerprint = contentFingerprint(record)
    const duplicateId = fingerprints.get(fingerprint)
    const result = (action: ImportCandidate['action'], reason: string) => ({ entry, action, reason, expectedRevision })
    if (seen.has(record.id)) return result('conflict', 'The import repeats this resource ID.')
    seen.add(record.id)
    if (current?.origin === 'bundled') return result('conflict', 'This ID belongs to a bundled resource.')
    if (current && JSON.stringify(current.record) === JSON.stringify(record)) return result('duplicate', 'This version is already in the library.')
    if (current && current.record.ownerId !== record.ownerId) return result('conflict', 'The resource owner metadata differs.')
    if (current && record.revision <= current.record.revision) return result('conflict', 'The incoming version is older or diverges at the same version.')
    if (duplicateId && duplicateId !== record.id) return result('duplicate', 'Identical files already belong to another resource.')
    fingerprints.set(fingerprint, record.id)
    return current ? result('update', 'Version ' + current.record.revision + ' can be replaced by version ' + record.revision + '.')
      : result('new', 'Ready to import.')
  })
}

function nextDate(previous: string) {
  return new Date(Math.max(Date.now(), Date.parse(previous))).toISOString()
}

export function createContentLibrary(repository: ContentRepository) {
  async function readUpload(file: File, assetId: string) {
    const type = fileType(file.name)
    await validateFile(file, type.media)
    const asset = parseAsset({
      id: assetId, name: file.name, mediaType: type.media, size: file.size, sha256: await sha256(file),
    })
    return { type: type.type, asset, blob: file.slice(0, file.size, type.media) }
  }

  return {
    list: repository.list,
    get: repository.get,
    async prepareFiles(files: readonly File[]) {
      if (files.length > 128 || files.reduce((sum, file) => sum + file.size, 0) > limits.expandedBytes) {
        throw new ContentError('Import at most 128 files and 64 MiB at a time.')
      }
      const entries: LibraryEntry[] = []
      for (const file of files) {
        const upload = await readUpload(file, crypto.randomUUID())
        const date = new Date().toISOString()
        const title = file.name.replace(/\.[^.]*$/, '').trim() || 'Untitled resource'
        const record = parseContent({
          schemaVersion: 1, id: crypto.randomUUID(), revision: 1, title: title.slice(0, 200), description: '',
          type: upload.type, subject: 'Music theory', category: 'Uncategorised', tags: [], author: '', attribution: '', licence: '',
          createdAt: date, updatedAt: date, ownerId: 'local', visibility: 'private', status: 'draft', files: [upload.asset],
        })
        entries.push({ record, assets: { [upload.asset.id]: upload.blob }, favourite: false, origin: 'imported' })
      }
      return previewLibraryImport(await repository.list(), entries)
    },
    async preview(entries: readonly LibraryEntry[]) {
      return previewLibraryImport(await repository.list(), entries)
    },
    async apply(preview: readonly ImportCandidate[], allowUpdates = false) {
      const changes: LibraryMutation[] = preview.filter(({ action }) => action === 'new' || (allowUpdates && action === 'update'))
        .map(({ entry, expectedRevision }) => ({ kind: 'put', entry, expectedRevision }))
      await repository.commit(changes)
      return changes.length
    },
    async update(entry: LibraryEntry, metadata: ContentMetadata, replacement?: File) {
      const original = entry.record
      const primary = original.files[0]!
      const upload = replacement ? await readUpload(replacement, primary.id) : undefined
      const record = parseContent({
        ...original, ...metadata, revision: original.revision + 1, updatedAt: nextDate(original.updatedAt),
        files: upload ? [upload.asset, ...original.files.slice(1)] : original.files,
      })
      await repository.commit([{
        kind: 'put', expectedRevision: original.revision,
        entry: { ...entry, record, assets: upload ? { ...entry.assets, [primary.id]: upload.blob } : entry.assets },
      }])
    },
    setFavourite: (id: string, value: boolean) => repository.commit([{ kind: 'favourite', id, value }]),
    remove: ({ id, revision }: LibraryItem['record']) => repository.commit([{ kind: 'delete', id, expectedRevision: revision }]),
  }
}

export type ContentLibrary = ReturnType<typeof createContentLibrary>
