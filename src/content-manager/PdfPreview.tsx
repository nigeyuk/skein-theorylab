import { useEffect, useRef, useState } from 'react'
import { AnnotationMode, getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = worker

const maximumPages = 200

function renderPage(page: PDFPageProxy, canvas: HTMLCanvasElement, maximumEdge: number, intent: 'display' | 'print') {
  const natural = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: Math.min(2.5, maximumEdge / Math.max(natural.width, natural.height)) })
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  return page.render({ canvas, viewport, intent, annotationMode: AnnotationMode.DISABLE })
}

function png(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not prepare a printable page.')), 'image/png')
  })
}

export default function PdfPreview({ blob, title }: { blob: Blob; title: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy>()
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [printing, setPrinting] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let active = true
    let task: PDFDocumentLoadingTask | undefined
    void (async () => {
      try {
        const data = new Uint8Array(await blob.arrayBuffer())
        if (!active) return
        task = getDocument({
          data, enableXfa: false, useSystemFonts: false, disableFontFace: true, useWasm: false,
          maxImageSize: 16_000_000, canvasMaxAreaInBytes: 32 * 1024 ** 2, useWorkerFetch: false,
        })
        const loaded = await task.promise
        if (!active) return
        if (loaded.numPages < 1 || loaded.numPages > maximumPages) throw new Error('PDF page limit exceeded')
        setPdf(loaded)
      } catch {
        if (active) setError('This PDF could not be opened. Use an unlocked PDF with at most 200 pages.')
      }
    })()
    return () => {
      active = false
      void task?.destroy().catch(() => {})
    }
  }, [blob])

  useEffect(() => {
    if (!pdf) return
    let active = true
    let drawing: RenderTask | undefined
    void (async () => {
      try {
        const current = await pdf.getPage(page)
        if (!active || !canvas.current) return
        drawing = renderPage(current, canvas.current, 1450, 'display')
        await drawing.promise
      } catch {
        if (active) setError('This page could not be rendered.')
      }
    })()
    return () => { active = false; drawing?.cancel() }
  }, [page, pdf])

  async function printDocument(wholeDocument: boolean) {
    if (!pdf) return
    const popup = window.open('about:blank', '_blank')
    if (!popup) { setError('Allow pop-ups for MyTheoryLab to print.'); return }
    popup.opener = null
    setPrinting(true)
    setError('')
    popup.document.title = title
    const status = popup.document.createElement('p')
    status.textContent = 'Preparing PDF pages…'
    popup.document.body.append(status)
    const urls: string[] = []
    const dispose = () => { for (const url of urls) URL.revokeObjectURL(url) }
    try {
      const style = popup.document.createElement('style')
      style.textContent = '@page{margin:10mm}body{margin:0;background:white}img{display:block;max-width:100%;max-height:calc(100vh - 20mm);margin:auto;break-after:page}img:last-child{break-after:auto}'
      popup.document.head.append(style)
      const printCanvas = document.createElement('canvas')
      const first = wholeDocument ? 1 : page
      const last = wholeDocument ? pdf.numPages : page
      for (let index = first; index <= last; index++) {
        if (popup.closed) throw new Error('Print window closed')
        const current = await pdf.getPage(index)
        await renderPage(current, printCanvas, 1400, 'print').promise
        const url = URL.createObjectURL(await png(printCanvas))
        urls.push(url)
        const image = popup.document.createElement('img')
        image.src = url
        image.alt = 'Page ' + index
        await image.decode()
        popup.document.body.append(image)
        current.cleanup()
      }
      status.remove()
      popup.addEventListener('afterprint', dispose, { once: true })
      popup.addEventListener('pagehide', dispose, { once: true })
      popup.focus()
      popup.print()
    } catch {
      dispose()
      popup.close()
      setError('Printing could not be prepared.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className="content-pdf">
      {error && <p role="alert">{error}</p>}
      {!pdf && !error && <p role="status">Opening PDF…</p>}
      {pdf && (
        <div className="lab-button-row" aria-label="PDF controls">
          <button className="lab-button" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pdf.numPages}</span>
          <button className="lab-button" type="button" disabled={page >= pdf.numPages} onClick={() => setPage(page + 1)}>Next</button>
          <button className="lab-button" type="button" disabled={printing} onClick={() => { void printDocument(false) }}>Print page</button>
          {pdf.numPages > 1 && pdf.numPages <= 40 && <button className="lab-button" type="button" disabled={printing} onClick={() => { void printDocument(true) }}>Print all</button>}
        </div>
      )}
      {pdf && <canvas ref={canvas} aria-label={title + ', page ' + page} role="img" />}
    </div>
  )
}
