export const supportedTypes = ['pdf', 'worksheet', 'answer-sheet', 'markdown', 'image', 'exercise'] as const
export const contentTypes = [...supportedTypes, 'audio', 'midi', 'musicxml', 'score'] as const
export const statuses = ['draft', 'review', 'published', 'archived'] as const
export const visibilities = ['private', 'public'] as const
export const difficulties = ['beginner', 'intermediate', 'advanced'] as const
export const mediaTypes = ['application/pdf', 'text/markdown', 'image/png', 'image/jpeg', 'application/json',
  'audio/mpeg', 'audio/midi', 'application/vnd.recordare.musicxml+xml', 'application/vnd.mytheorylab.score+json'] as const

export type ContentType = typeof contentTypes[number]
export type SupportedType = typeof supportedTypes[number]
export type MediaType = typeof mediaTypes[number]

export interface AssetDescriptor {
  readonly id: string
  readonly name: string
  readonly mediaType: MediaType
  readonly size: number
  readonly sha256: string
}

export interface ContentRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly revision: number
  readonly title: string
  readonly description: string
  readonly type: ContentType
  readonly subject: string
  readonly category: string
  readonly tags: readonly string[]
  readonly author: string
  readonly attribution: string
  readonly licence: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly ownerId: string
  readonly visibility: typeof visibilities[number]
  readonly status: typeof statuses[number]
  readonly files: readonly AssetDescriptor[]
  readonly relatedResourceIds: readonly string[]
  readonly prerequisites: readonly string[]
  readonly difficulty?: typeof difficulties[number]
}

export type ContentMetadata = Pick<ContentRecord, 'title' | 'description' | 'type' | 'subject' | 'category'
  | 'tags' | 'author' | 'attribution' | 'licence' | 'visibility' | 'status' | 'relatedResourceIds' | 'prerequisites' | 'difficulty'>

export interface LibraryItem {
  readonly record: ContentRecord
  readonly favourite: boolean
  readonly origin: 'imported' | 'bundled'
}

export interface LibraryEntry extends LibraryItem {
  readonly assets: Readonly<Record<string, Blob>>
}

export const limits = {
  fileBytes: 20 * 1024 ** 2,
  textBytes: 1024 ** 2,
  archiveBytes: 48 * 1024 ** 2,
  expandedBytes: 64 * 1024 ** 2,
  packEntries: 129,
  imagePixels: 16_000_000,
}

export class ContentError extends Error {
  constructor(message: string) { super(message); this.name = 'ContentError' }
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContentError(label + ' must be an object.')
  return value as Record<string, unknown>
}

export function text(value: unknown, label: string, max = 200, required = true): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (required && !value.trim())) {
    throw new ContentError(label + ' must be ' + (required ? 'non-empty ' : '') + 'text of at most ' + max + ' characters.')
  }
  return value.trim()
}

export function choice<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new ContentError(label + ' has an unsupported value.')
  return value as T
}

export function identifier(value: unknown, label: string): string {
  const id = text(value, label, 100)
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) throw new ContentError(label + ' is invalid.')
  return id
}

export function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new ContentError('Invalid SHA-256 digest.')
  return value
}

export function integer(value: unknown, label: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new ContentError(label + ' is out of range.')
  return value
}

function date(value: unknown, label: string): string {
  const input = text(value, label, 35)
  const parsed = new Date(input)
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input) || !Number.isFinite(parsed.getTime())) throw new ContentError(label + ' must be an ISO date and time.')
  return parsed.toISOString()
}

function list<T>(value: unknown, label: string, parse: (item: unknown) => T, max = 30): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ContentError(label + ' must be a list of at most ' + max + ' entries.')
  return value.map(parse)
}

export function parseMediaType(value: unknown): MediaType {
  // Accept the old reserved identifier in serialized descriptors and manifests.
  return value === 'application/vnd.skein.score+json' ? 'application/vnd.mytheorylab.score+json'
    : choice(value, mediaTypes, 'Media type')
}

export function parseAsset(value: unknown): AssetDescriptor {
  const input = object(value, 'File')
  const name = text(input.name, 'File name', 180)
  if (/[/\\:\x00-\x1f\x7f]/.test(name) || name === '.' || name === '..') throw new ContentError('File names may not contain paths or control characters.')
  return {
    id: identifier(input.id, 'File ID'), name, mediaType: parseMediaType(input.mediaType),
    size: integer(input.size, 'File size', 1, limits.fileBytes), sha256: digest(input.sha256),
  }
}

const primaryMedia: Record<ContentType, readonly MediaType[]> = {
  pdf: ['application/pdf'], worksheet: ['application/pdf'], 'answer-sheet': ['application/pdf'],
  markdown: ['text/markdown'], image: ['image/png', 'image/jpeg'], exercise: ['application/json'],
  audio: ['audio/mpeg'], midi: ['audio/midi'], musicxml: ['application/vnd.recordare.musicxml+xml'],
  score: ['application/vnd.mytheorylab.score+json'],
}

export function parseContent(value: unknown): ContentRecord {
  const input = object(value, 'Content')
  if (input.schemaVersion !== 1) throw new ContentError('Unsupported content schema version.')
  const files = list(input.files, 'Files', parseAsset, 20)
  const type = choice(input.type, contentTypes, 'Content type')
  if (!files[0] || !primaryMedia[type].includes(files[0].mediaType)) throw new ContentError('The primary file does not match the content type.')
  if (new Set(files.map(({ id }) => id)).size !== files.length) throw new ContentError('File IDs must be unique within a resource.')
  const createdAt = date(input.createdAt, 'Creation date')
  const updatedAt = date(input.updatedAt, 'Modification date')
  if (updatedAt < createdAt) throw new ContentError('Modification date cannot precede creation.')
  return {
    schemaVersion: 1, id: identifier(input.id, 'Resource ID'), revision: integer(input.revision, 'Content version', 1),
    title: text(input.title, 'Title'), description: text(input.description, 'Description', 4000, false),
    type, subject: text(input.subject, 'Subject', 100), category: text(input.category, 'Category', 100),
    tags: [...new Set(list(input.tags, 'Tags', (tag) => text(tag, 'Tag', 50)))],
    author: text(input.author, 'Author', 200, false), attribution: text(input.attribution, 'Attribution', 1000, false),
    licence: text(input.licence, 'Licence', 200, false), createdAt, updatedAt,
    ownerId: identifier(input.ownerId, 'Owner ID'), visibility: choice(input.visibility, visibilities, 'Visibility'),
    status: choice(input.status, statuses, 'Status'), files,
    relatedResourceIds: [...new Set(list(input.relatedResourceIds ?? [], 'Related resources', (id) => identifier(id, 'Related resource ID')))],
    prerequisites: [...new Set(list(input.prerequisites ?? [], 'Prerequisites', (id) => identifier(id, 'Prerequisite ID')))],
    ...(input.difficulty == null ? {} : { difficulty: choice(input.difficulty, difficulties, 'Difficulty') }),
  }
}

export function contentFingerprint(record: ContentRecord): string {
  return record.files.map(({ sha256 }) => sha256).sort().join(':')
}
