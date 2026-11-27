import { useEffect, useRef, useState } from 'react'
import { Download, FilePlus2, LibraryBig, Star } from 'lucide-react'
import { createContentLibrary, searchLibrary } from '../content/library'
import type { ContentLibrary, ImportCandidate, LibraryFilters } from '../content/library'
import { ContentError, supportedTypes } from '../content/model'
import type { ContentMetadata, LibraryEntry, LibraryItem } from '../content/model'
import { acceptedPackExtensions, contentPackExtension, isContentPackFilename, readContentPack, writeContentPack } from '../content/pack'
import { productName } from '../app/brand'
import { createIndexedDbContentRepository } from '../storage/indexeddb-content'
import { AssetPreview } from './AssetPreview'
import { MetadataEditor, typeNames } from './MetadataEditor'
import './content-manager.css'

const localLibrary = createContentLibrary(createIndexedDbContentRepository())
const extensions = ['.pdf', '.md', '.markdown', '.png', '.jpg', '.jpeg', '.json', ...acceptedPackExtensions].join(',')

function failureMessage(error: unknown): string {
  if (error instanceof ContentError) return error.message
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'Browser storage is full. Export or remove resources before importing more.'
  return 'The operation could not be completed. Check browser storage and try again.'
}

function savePack(blob: Blob, title: string) {
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || productName.toLowerCase()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename + contentPackExtension
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function ContentManager({ library = localLibrary }: { library?: ContentLibrary }) {
  const [items, setItems] = useState<readonly LibraryItem[]>([])
  const [filters, setFilters] = useState<LibraryFilters>({})
  const [entry, setEntry] = useState<LibraryEntry>()
  const [assetId, setAssetId] = useState<string>()
  const [selection, setSelection] = useState<string[]>([])
  const [preview, setPreview] = useState<{ title: string; candidates: ImportCandidate[] }>()
  const [allowUpdates, setAllowUpdates] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus() }, [])

  useEffect(() => {
    let active = true
    void library.list().then((result) => { if (active) setItems(result) })
      .catch((error: unknown) => { if (active) setError(failureMessage(error)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [library])

  const visible = searchLibrary(items, filters)
  const categories = [...new Set(items.map(({ record }) => record.category))].sort()
  const tags = [...new Set(items.flatMap(({ record }) => record.tags))].sort()
  const descriptor = entry?.record.files.find((file) => file.id === assetId) ?? entry?.record.files[0]
  const asset = entry && descriptor ? entry.assets[descriptor.id] : undefined
  const importCount = preview?.candidates.filter(({ action }) => action === 'new' || (allowUpdates && action === 'update')).length ?? 0

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setStatus('')
    try { await action(); return true }
    catch (error) { setError(failureMessage(error)); return false }
    finally { setBusy(false) }
  }

  async function startImport(files: readonly File[]) {
    if (!files.length || busy) return
    setPreview(undefined)
    setAllowUpdates(false)
    await run(async () => {
      const packs = files.filter(({ name }) => isContentPackFilename(name))
      if (packs.length) {
        if (files.length !== 1) throw new ContentError('Select one content pack at a time.')
        const pack = await readContentPack(packs[0]!)
        setPreview({ title: pack.title, candidates: await library.preview(pack.entries) })
      } else {
        const candidates = await library.prepareFiles(files)
        setPreview({ title: files.length === 1 ? files[0]!.name : 'Selected files', candidates })
      }
    })
  }

  async function openResource(id: string) {
    await run(async () => {
      const selected = await library.get(id)
      if (!selected) throw new ContentError('This resource is no longer in the library.')
      setEntry(selected)
      setAssetId(undefined)
      setEditing(false)
      setConfirmDelete(false)
    })
  }

  async function exportResources(ids: readonly string[], title: string, backup = false) {
    await run(async () => {
      const entries: LibraryEntry[] = []
      for (const id of ids) {
        const entry = await library.get(id)
        if (!entry) throw new ContentError('A selected resource was removed. Refresh the library.')
        entries.push(entry)
      }
      savePack(await writeContentPack(entries, title, backup), title)
      setStatus('Content pack exported.')
    })
  }

  async function saveMetadata(metadata: ContentMetadata, replacement?: File) {
    if (!entry) return false
    return run(async () => {
      await library.update(entry, metadata, replacement)
      setItems(await library.list())
      setEntry(await library.get(entry.record.id))
      setEditing(false)
      setStatus('Saved a new version.')
    })
  }

  return (
    <section className="content-manager" aria-labelledby="workspace-title">
      <header className="content-heading">
        <div>
          <h1 id="workspace-title" tabIndex={-1} ref={heading}>Content Manager</h1>
          <p>Organise references, worksheets and lessons in this browser.</p>
        </div>
        <div className="lab-button-row">
          <button className="lab-button" type="button" disabled={busy || !selection.length}
            onClick={() => { void exportResources(selection, productName + ' collection') }}><Download size={16} aria-hidden="true" /> Export selected</button>
          <button className="lab-button" type="button" disabled={busy || !items.length}
            onClick={() => { void exportResources(items.map(({ record }) => record.id), productName + ' library', true) }}><Download size={16} aria-hidden="true" /> Export library</button>
        </div>
      </header>

      <div className="content-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        event.preventDefault()
        void startImport(Array.from(event.dataTransfer.files))
      }}>
        <FilePlus2 size={24} aria-hidden="true" />
        <div><strong>Drop files or a MyTheoryLab content pack here</strong><p>PDF, Markdown, PNG, JPEG or exercise JSON</p></div>
        <button className="lab-button lab-primary" type="button" disabled={busy} onClick={() => importInput.current?.click()}>Choose files</button>
        <input ref={importInput} type="file" hidden multiple accept={extensions} onChange={(event) => {
          void startImport(Array.from(event.target.files ?? []))
          event.target.value = ''
        }} />
      </div>
      {error && <p className="content-feedback" role="alert">{error}</p>}
      {status && <p className="content-feedback" role="status">{status}</p>}

      {preview && (
        <section className="content-panel content-import" aria-labelledby="import-preview">
          <h2 id="import-preview">Import preview</h2>
          <p>{preview.title}</p>
          <ul>
            {preview.candidates.map(({ entry, action, reason }) => (
              <li key={entry.record.id}><strong>{entry.record.title}</strong><span className="content-pill">{action}</span><span>{reason}</span></li>
            ))}
          </ul>
          {preview.candidates.some(({ action }) => action === 'update') && (
            <label className="content-check"><input type="checkbox" checked={allowUpdates} onChange={(event) => setAllowUpdates(event.target.checked)} /> Apply newer versions</label>
          )}
          <div className="lab-button-row">
            <button className="lab-button lab-primary" type="button" disabled={!importCount || busy}
              onClick={() => { void run(async () => {
                const count = await library.apply(preview.candidates, allowUpdates)
                setItems(await library.list())
                if (entry) setEntry(await library.get(entry.record.id))
                setPreview(undefined)
                setStatus((count === 1 ? '1 resource' : count + ' resources') + ' imported or updated.')
              }) }}>Import {importCount}</button>
            <button className="lab-button" type="button" disabled={busy} onClick={() => setPreview(undefined)}>Cancel</button>
          </div>
        </section>
      )}

      <div className="content-filters">
        <label>Search library<input type="search" value={filters.query ?? ''} placeholder="Title, subject, author or tag" onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label>
        <label>Content type<select value={filters.type ?? ''} onChange={(event) => setFilters({ ...filters, type: supportedTypes.find((type) => type === event.target.value) })}>
          <option value="">All types</option>
          {supportedTypes.map((type) => <option value={type} key={type}>{typeNames[type]}</option>)}
        </select></label>
        <label>Category<select value={filters.category ?? ''} onChange={(event) => setFilters({ ...filters, category: event.target.value || undefined })}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category}>{category}</option>)}
        </select></label>
        <label>Tag<select value={filters.tag ?? ''} onChange={(event) => setFilters({ ...filters, tag: event.target.value || undefined })}>
          <option value="">All tags</option>
          {tags.map((tag) => <option key={tag}>{tag}</option>)}
        </select></label>
        <label className="content-check"><input type="checkbox" checked={filters.favouritesOnly ?? false} onChange={(event) => setFilters({ ...filters, favouritesOnly: event.target.checked })} /> Favourites</label>
      </div>

      <div className="content-library-grid">
        <section className="content-panel" aria-labelledby="resources-heading">
          <header className="content-panel-header"><h2 id="resources-heading">Resources</h2><span>{visible.length} of {items.length}</span></header>
          {loading && <p role="status">Loading library…</p>}
          {!loading && !visible.length && <p>{items.length ? 'No resources match your filters.' : 'Import a file to start your library.'}</p>}
          <ul className="content-items">
            {visible.map((item) => {
              const { record, favourite } = item
              return (
                <li key={record.id} data-selected={record.id === entry?.record.id || undefined}>
                  <input type="checkbox" aria-label={'Select ' + record.title + ' for export'} checked={selection.includes(record.id)}
                    onChange={(event) => setSelection((prior) => event.target.checked ? [...prior, record.id] : prior.filter((id) => id !== record.id))} />
                  <button className="content-resource" type="button" disabled={busy} onClick={() => { void openResource(record.id) }}>
                    <strong>{record.title}</strong>
                    <span>{typeNames[record.type]} · {record.category}</span>
                  </button>
                  <button className="lab-button content-star" aria-label={'Favourite ' + record.title} aria-pressed={favourite} type="button" disabled={busy}
                    onClick={() => { void run(async () => {
                      await library.setFavourite(record.id, !favourite)
                      setItems(await library.list())
                    }) }}><Star size={16} fill={favourite ? 'currentColor' : 'none'} aria-hidden="true" /></button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="content-panel content-detail" aria-label="Resource detail">
          {entry ? (
            <>
              <header className="content-panel-header"><h2>{entry.record.title}</h2><span className="content-pill">Version {entry.record.revision}</span></header>
              <p>{typeNames[entry.record.type]} · {entry.record.subject} · {entry.record.category}</p>
              {entry.record.description && <p>{entry.record.description}</p>}
              {entry.record.tags.length > 0 && <ul className="content-tags">{entry.record.tags.map((tag) => <li className="content-pill" key={tag}>{tag}</li>)}</ul>}
              <p>{entry.record.status} · {entry.record.visibility} metadata · {entry.origin}</p>
              {(entry.record.author || entry.record.licence || entry.record.attribution) && <p>{[entry.record.author, entry.record.licence, entry.record.attribution].filter(Boolean).join(' · ')}</p>}
              <div className="lab-button-row">
                {entry.origin === 'imported' && <>
                  <button className="lab-button" type="button" disabled={busy} aria-pressed={editing} onClick={() => { setEditing(!editing); setConfirmDelete(false) }}>Edit metadata</button>
                  <button className="lab-button" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
                </>}
                <button className="lab-button" type="button" disabled={busy}
                  onClick={() => { void exportResources([entry.record.id], entry.record.title) }}>Export resource</button>
              </div>
              {confirmDelete && (
                <div className="content-confirm">
                  <p>Remove this resource and its files from the local library?</p>
                  <div className="lab-button-row">
                    <button className="lab-button lab-primary" type="button" disabled={busy} onClick={() => { void run(async () => {
                      await library.remove(entry.record)
                      setItems(await library.list())
                      setSelection((prior) => prior.filter((id) => id !== entry.record.id))
                      setEntry(undefined)
                      setConfirmDelete(false)
                      setStatus('Resource removed.')
                    }) }}>Confirm deletion</button>
                    <button className="lab-button" type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel deletion</button>
                  </div>
                </div>
              )}
              {editing ? <MetadataEditor key={entry.record.id + ':' + entry.record.revision} entry={entry} busy={busy} onSave={saveMetadata} /> : (
                <>
                  {entry.record.files.length > 1 && <label className="content-asset-select">Resource file<select value={descriptor?.id ?? ''} onChange={(event) => setAssetId(event.target.value)}>
                    {entry.record.files.map((file) => <option value={file.id} key={file.id}>{file.name}</option>)}
                  </select></label>}
                  {descriptor && asset && <AssetPreview key={descriptor.id + ':' + descriptor.sha256} descriptor={descriptor} blob={asset} title={entry.record.title} />}
                </>
              )}
            </>
          ) : <div className="content-empty"><LibraryBig aria-hidden="true" /><p>Select a resource to view or edit it.</p></div>}
        </section>
      </div>
    </section>
  )
}
