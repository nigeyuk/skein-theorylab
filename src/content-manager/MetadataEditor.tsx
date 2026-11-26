import { useState } from 'react'
import type { FormEvent } from 'react'
import { difficulties, statuses, supportedTypes, visibilities } from '../content/model'
import type { ContentMetadata, LibraryEntry } from '../content/model'

export const typeNames = {
  pdf: 'PDF reference', worksheet: 'Worksheet', 'answer-sheet': 'Answer sheet', markdown: 'Markdown lesson',
  image: 'Image or diagram', exercise: 'Exercise', audio: 'Audio', midi: 'MIDI',
  musicxml: 'MusicXML', score: 'Score',
}

export function MetadataEditor({ entry, busy, onSave }: {
  entry: LibraryEntry
  busy: boolean
  onSave(metadata: ContentMetadata, replacement?: File): Promise<boolean>
}) {
  const { record } = entry
  const [replacement, setReplacement] = useState<File>()
  const compatibleTypes = record.files[0]?.mediaType === 'application/pdf'
    ? supportedTypes.filter((type) => type === 'pdf' || type === 'worksheet' || type === 'answer-sheet')
    : [record.type]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const field = (name: string) => String(data.get(name) ?? '')
    const split = (name: string) => field(name).split(',').map((word) => word.trim()).filter(Boolean)
    const type = compatibleTypes.find((value) => value === field('type')) ?? record.type
    const status = statuses.find((value) => value === field('status')) ?? record.status
    const visibility = visibilities.find((value) => value === field('visibility')) ?? record.visibility
    const difficulty = difficulties.find((value) => value === field('difficulty'))
    void onSave({
      title: field('title'), description: field('description'), type, status, visibility, difficulty,
      subject: field('subject'), category: field('category'), tags: split('tags'), author: field('author'),
      attribution: field('attribution'), licence: field('licence'), prerequisites: split('prerequisites'),
      relatedResourceIds: split('related'),
    }, replacement)
  }

  return (
    <form className="content-form" onSubmit={submit}>
      <label>Title<input name="title" required maxLength={200} defaultValue={record.title} /></label>
      <label>Subject<input name="subject" required maxLength={100} defaultValue={record.subject} /></label>
      <label>Category<input name="category" required maxLength={100} defaultValue={record.category} /></label>
      <label>Type<select name="type" defaultValue={record.type}>{compatibleTypes.map((type) => <option key={type} value={type}>{typeNames[type]}</option>)}</select></label>
      <label className="content-wide">Description<textarea name="description" rows={3} maxLength={4000} defaultValue={record.description} /></label>
      <label className="content-wide">Tags (comma-separated)<input name="tags" maxLength={1500} defaultValue={record.tags.join(', ')} /></label>
      <label>Author<input name="author" maxLength={200} defaultValue={record.author} /></label>
      <label>Licence<input name="licence" maxLength={200} defaultValue={record.licence} /></label>
      <label className="content-wide">Attribution<textarea name="attribution" rows={2} maxLength={1000} defaultValue={record.attribution} /></label>
      <label>Workflow status<select name="status" defaultValue={record.status}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Visibility (metadata only)<select name="visibility" defaultValue={record.visibility}>{visibilities.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Difficulty<select name="difficulty" defaultValue={record.difficulty ?? ''}><option value="">Unspecified</option>{difficulties.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Owner ID<input value={record.ownerId} readOnly /></label>
      <label>Prerequisite IDs<input name="prerequisites" maxLength={3000} defaultValue={record.prerequisites.join(', ')} /></label>
      <label>Related resource IDs<input name="related" maxLength={3000} defaultValue={record.relatedResourceIds.join(', ')} /></label>
      <label className="content-wide">Replace primary file (optional)<input type="file" accept=".pdf,.md,.markdown,.png,.jpg,.jpeg,.json" onChange={(event) => setReplacement(event.target.files?.[0])} /></label>
      <button className="lab-button lab-primary" type="submit" disabled={busy}>Save version {record.revision + 1}</button>
    </form>
  )
}
