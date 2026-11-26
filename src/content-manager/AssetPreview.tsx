import { lazy, Suspense, useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { parseExercise, readJson, readText } from '../content/files'
import type { AssetDescriptor } from '../content/model'

const PdfPreview = lazy(() => import('./PdfPreview'))
const markdownElements = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'em', 'strong', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'br', 'hr']

function ImagePreview({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return error ? <p role="alert">This image could not be decoded.</p>
    : url && <img className="content-image" src={url} alt={name} onError={() => setError(true)} />
}

export function AssetPreview({ descriptor, blob, title }: { descriptor: AssetDescriptor; blob: Blob; title: string }) {
  const [view, setView] = useState<{ markdown?: string; questions?: ReturnType<typeof parseExercise>; error?: string }>({})
  const { mediaType } = descriptor

  useEffect(() => {
    let active = true
    if (mediaType === 'text/markdown') {
      void readText(blob).then((markdown) => { if (active) setView({ markdown }) })
        .catch(() => { if (active) setView({ error: 'This lesson could not be read.' }) })
    }
    if (mediaType === 'application/json') {
      void readJson(blob).then(parseExercise).then((questions) => { if (active) setView({ questions }) })
        .catch(() => { if (active) setView({ error: 'This exercise could not be read.' }) })
    }
    return () => { active = false }
  }, [blob, mediaType])

  if (mediaType === 'application/pdf') return <Suspense fallback={<p role="status">Loading PDF viewer…</p>}><PdfPreview blob={blob} title={title} /></Suspense>
  if (mediaType === 'image/png' || mediaType === 'image/jpeg') return <ImagePreview blob={blob} name={descriptor.name} />
  if (view.error) return <p role="alert">{view.error}</p>
  if (view.markdown !== undefined) {
    return <div className="content-markdown"><Markdown allowedElements={markdownElements} unwrapDisallowed skipHtml>{view.markdown}</Markdown></div>
  }
  if (view.questions) return (
    <ol className="content-questions">
      {view.questions.map((question) => (
        <li key={question.id}>
          <p>{question.prompt}</p>
          {question.kind === 'multiple-choice' && <ul>{question.choices.map((choice, index) => <li key={index}>{choice}</li>)}</ul>}
          <details>
            <summary>Show answer</summary>
            <p>{question.kind === 'multiple-choice' ? question.choices[question.answer] : question.answer}</p>
          </details>
        </li>
      ))}
    </ol>
  )
  return <p role="status">Preparing preview…</p>
}
