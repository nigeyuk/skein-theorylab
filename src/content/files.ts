import { ContentError, identifier, limits, object, text } from './model'
import type { MediaType, SupportedType } from './model'

const fileTypes: Record<string, { type: SupportedType; media: MediaType }> = {
  pdf: { type: 'pdf', media: 'application/pdf' },
  md: { type: 'markdown', media: 'text/markdown' },
  markdown: { type: 'markdown', media: 'text/markdown' },
  png: { type: 'image', media: 'image/png' },
  jpg: { type: 'image', media: 'image/jpeg' },
  jpeg: { type: 'image', media: 'image/jpeg' },
  json: { type: 'exercise', media: 'application/json' },
}

export function fileType(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? ''
  if (!name.includes('.') || !Object.hasOwn(fileTypes, extension)) throw new ContentError('Unsupported file. Choose a PDF, Markdown, PNG, JPEG or exercise JSON file.')
  return fileTypes[extension]!
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type ExerciseQuestion =
  | { id: string; prompt: string; kind: 'short-answer'; answer: string }
  | { id: string; prompt: string; kind: 'multiple-choice'; choices: string[]; answer: number }

export function parseExercise(value: unknown): ExerciseQuestion[] {
  const exercise = object(value, 'Exercise')
  if (exercise.schemaVersion !== 1 || !Array.isArray(exercise.questions) || !exercise.questions.length || exercise.questions.length > 100) {
    throw new ContentError('Exercise JSON needs schemaVersion 1 and 1–100 questions.')
  }
  const ids = new Set<string>()
  return exercise.questions.map((value: unknown) => {
    const question = object(value, 'Question')
    const id = identifier(question.id, 'Question ID')
    if (ids.has(id)) throw new ContentError('Exercise question IDs must be unique.')
    ids.add(id)
    const prompt = text(question.prompt, 'Question prompt', 2000)
    if (question.kind === 'short-answer') return { id, prompt, kind: question.kind, answer: text(question.answer, 'Answer', 1000) }
    if (question.kind !== 'multiple-choice' || !Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 12) {
      throw new ContentError('Each question needs a supported kind and valid choices.')
    }
    const choices = question.choices.map((value: unknown) => text(value, 'Answer choice', 1000))
    if (!Number.isInteger(question.answer) || (question.answer as number) < 0 || (question.answer as number) >= choices.length) {
      throw new ContentError('Multiple-choice answers must identify a valid zero-based choice.')
    }
    return { id, prompt, kind: question.kind, choices, answer: question.answer as number }
  })
}

export async function readText(blob: Blob): Promise<string> {
  if (blob.size > limits.textBytes) throw new ContentError('Text and JSON files are limited to 1 MiB.')
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer())
    if (content.includes('\0')) throw new Error()
    return content
  } catch { throw new ContentError('The file must contain valid UTF-8 text.') }
}

export async function readJson(blob: Blob): Promise<unknown> {
  const input = await readText(blob)
  try { return JSON.parse(input) as unknown } catch { throw new ContentError('Invalid JSON.') }
}

function imageSize(width: number, height: number) {
  if (width < 1 || height < 1 || width * height > limits.imagePixels) throw new ContentError('Image dimensions exceed the 16-megapixel limit.')
}

function validateJpeg(data: DataView) {
  if (data.byteLength < 4 || data.getUint16(0) !== 0xffd8) throw new ContentError('Invalid JPEG header.')
  let index = 2
  while (index + 4 <= data.byteLength && data.getUint8(index++) === 0xff) {
    while (index < data.byteLength && data.getUint8(index) === 0xff) index++
    if (index + 3 > data.byteLength) break
    const marker = data.getUint8(index++)
    const bytes = data.getUint16(index)
    if (bytes < 2 || index + bytes > data.byteLength) break
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (bytes < 8) break
      imageSize(data.getUint16(index + 5), data.getUint16(index + 3))
      return
    }
    if (marker === 0xda || marker === 0xd9) break
    index += bytes
  }
  throw new ContentError('JPEG dimensions could not be verified.')
}

export async function validateFile(blob: Blob, media: MediaType): Promise<void> {
  if (!blob.size || blob.size > limits.fileBytes) throw new ContentError('Files must be non-empty and no larger than 20 MiB.')
  switch (media) {
    case 'application/pdf': {
      const header = await blob.slice(0, 8).text()
      if (!/^%PDF-\d\.\d/.test(header)) throw new ContentError('Invalid PDF header.')
      return
    }
    case 'text/markdown':
      await readText(blob)
      return
    case 'application/json':
      parseExercise(await readJson(blob))
      return
    case 'image/png': {
      const header = new DataView(await blob.slice(0, 24).arrayBuffer())
      if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a
        || header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452) throw new ContentError('Invalid PNG header.')
      imageSize(header.getUint32(16), header.getUint32(20))
      return
    }
    case 'image/jpeg':
      validateJpeg(new DataView(await blob.arrayBuffer()))
      return
    default:
      throw new ContentError('This resource format is reserved for a future release.')
  }
}
