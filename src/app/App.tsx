import { useEffect, useRef, useState } from 'react'
import { AudioWaveform, ChevronDown, Menu, MoveUpRight } from 'lucide-react'
import { KeyboardPanel } from '../visualisation/keyboard/KeyboardPanel'
import { createAudioEngine } from '../audio'
import { browserMidiRequest, createMidiInput } from '../midi'
import { createNoteInputManager } from '../note-input'
import { midiPreferences } from '../storage/midi-preferences'
import { ChordWorkspace } from '../reference/interactive/ChordWorkspace'
import { IntervalWorkspace } from '../reference/interactive/IntervalWorkspace'
import type { KeyboardAccess } from '../visualisation/keyboard/model'
import { AppVersion } from './AppVersion'
import { useNavigation } from './navigation'
import { dashboard, workspaceGroups } from './workspaces'
import type { Workspace } from './workspaces'

const path = (id: string) => '#/' + id

function NavLink({ workspace, active }: { workspace: Workspace; active: boolean }) {
  const Icon = workspace.icon
  return (
    <a className="nav-link" href={path(workspace.id)} aria-current={active ? 'page' : undefined}>
      <Icon size={17} aria-hidden="true" />
      {workspace.title}
    </a>
  )
}

function WorkspaceNav({ active }: { active: string }) {
  return (
        <nav aria-label="Workspaces">
          <NavLink workspace={dashboard} active={active === dashboard.id} />
          {workspaceGroups.map(({ title, workspaces }) => (
            <div className="nav-group" key={title}>
              <p>{title}</p>
              {workspaces.map((workspace) => <NavLink key={workspace.id} workspace={workspace} active={active === workspace.id} />)}
            </div>
          ))}
        </nav>
  )
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="sidebar">
      <a className="brand" href={path(dashboard.id)}>
        <span className="brand-icon"><AudioWaveform size={24} aria-hidden="true" /></span>
        <span><strong>SKEIN</strong><small>TheoryLab</small></span>
      </a>
      <div className="desktop-nav"><WorkspaceNav active={active} /></div>
      <details className="mobile-nav" key={active}>
        <summary><Menu size={18} aria-hidden="true" /> Workspaces <ChevronDown size={16} aria-hidden="true" /></summary>
        <WorkspaceNav active={active} />
      </details>
      <AppVersion />
    </aside>
  )
}

function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const Icon = workspace.icon
  return (
    <a className="module-card" data-color={workspace.color} href={path(workspace.id)}>
      <span className="module-icon"><Icon size={22} aria-hidden="true" /></span>
      <MoveUpRight className="card-arrow" size={16} aria-hidden="true" />
      <h3>{workspace.title}</h3>
      <p>{workspace.description}</p>
    </a>
  )
}

function Dashboard() {
  return (
    <>
      <section className="hero" aria-labelledby="workspace-title">
        <div className="hero-art" aria-hidden="true"><span>♩</span><span>♫</span><span>♪</span></div>
        <div className="hero-copy">
          <h1 id="workspace-title" tabIndex={-1}>Music theory<span>,</span><br />in your own time.</h1>
          <p>Explore the structure of music, from first notes to composition, in one workspace.</p>
        </div>
      </section>
      {workspaceGroups.map(({ title, workspaces }) => (
        <section className="module-section" key={title} aria-label={title}>
          <h2>{title === 'Reference' ? 'Theory reference' : title}</h2>
          <div className="module-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((workspace) => <WorkspaceCard key={workspace.id} workspace={workspace} />)}
          </div>
        </section>
      ))}
    </>
  )
}

function Placeholder({ workspace }: { workspace: Workspace }) {
  const Icon = workspace.icon
  const progress = workspace.id === 'learning-progress'
  return (
    <section className="placeholder" data-color={workspace.color} aria-labelledby="workspace-title">
      <span className="module-icon"><Icon size={26} aria-hidden="true" /></span>
      <h1 id="workspace-title" tabIndex={-1}>{workspace.title}</h1>
      <p>{workspace.description}</p>
      <div className="placeholder-status">{progress ? 'Progress tracking is planned' : 'Planned workspace'}</div>
      <a className="back-link" href={path(dashboard.id)}>Back to dashboard</a>
    </section>
  )
}

export function App() {
  const workspace = useNavigation((state) => state.workspace)
  const initialWorkspace = useRef(workspace.id)
  const main = useRef<HTMLElement>(null)
  const [{ audio, input, midi }] = useState(() => {
    const audio = createAudioEngine()
    const input = createNoteInputManager(audio)
    const midi = createMidiInput({
      requestAccess: browserMidiRequest(),
      preferences: midiPreferences,
      emit: (event) => { void input.dispatch(event).catch(() => {}) },
    })
    return { audio, input, midi }
  })
  const access: KeyboardAccess = workspace.keyboard ?? { mode: 'hidden' }
  const Study = workspace.id === 'intervals' ? IntervalWorkspace : workspace.id === 'chords' ? ChordWorkspace : null

  useEffect(() => {
    const stop = () => { midi.resetNotes(); input.panic() }
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', visibility)
      midi.disable()
      input.panic()
      void audio.dispose().catch(() => {})
    }
  }, [audio, input, midi])

  useEffect(() => {
    const available = workspace.keyboard?.mode === 'available'
    input.setMidiPolicy(workspace.midi ?? { input: available, feedback: available })
    document.title = workspace.title + ' · SKEIN TheoryLab'
    if (initialWorkspace.current !== workspace.id) {
      midi.resetNotes()
      input.panic()
      main.current?.querySelector('h1')?.focus()
      window.scrollTo(0, 0)
      initialWorkspace.current = workspace.id
    }
  }, [input, midi, workspace])

  return (
    <div className="shell">
      <Sidebar active={workspace.id} />
      <main className="main" ref={main}>
        <header className="topbar"><span>Workspace</span><span aria-hidden="true">/</span><strong>{workspace.title}</strong></header>
        {Study ? <Study key={workspace.id} title={workspace.title} description={workspace.description} access={access} audio={audio} input={input} midi={midi} /> : (
          <>
            <div className="content">
              {workspace.id === dashboard.id ? <Dashboard /> : <Placeholder workspace={workspace} />}
            </div>
            <KeyboardPanel key={workspace.id} access={access} audio={audio} input={input} midi={midi} />
          </>
        )}
      </main>
    </div>
  )
}
