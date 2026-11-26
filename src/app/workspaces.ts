import {
  AudioLines, BookOpen, Circle, Guitar, Layers3, LayoutGrid, ListMusic,
  Music2, Piano, Settings2, Sigma, TrendingUp, Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { KeyboardAccess } from '../visualisation/keyboard/model'

export interface Workspace {
  id: string
  title: string
  description: string
  icon: LucideIcon
  color: string
  keyboard?: KeyboardAccess
}

export const dashboard: Workspace = {
  id: 'dashboard', title: 'Dashboard', description: '', icon: LayoutGrid, color: 'accent',
}

const keyboardAvailable = { mode: 'available' } satisfies KeyboardAccess

export const workspaceGroups = [
  {
    title: 'Reference',
    workspaces: [
      { id: 'cheat-sheets', title: 'Cheat sheets', description: 'Quick reference for the notation, patterns and formulas you use most.', icon: BookOpen, color: 'accent', keyboard: keyboardAvailable },
      { id: 'fundamentals', title: 'Musical fundamentals', description: 'Start with pitch, rhythm, notation and the building blocks of music.', icon: Music2, color: 'blue', keyboard: keyboardAvailable },
      { id: 'scales-modes', title: 'Scales and modes', description: 'Explore scale patterns, key signatures and modal relationships.', icon: Piano, color: 'mint', keyboard: keyboardAvailable },
      { id: 'intervals', title: 'Intervals', description: 'Understand the distance between notes and how intervals are named.', icon: AudioLines, color: 'amber', keyboard: keyboardAvailable },
      { id: 'chords', title: 'Chords', description: 'Build triads and seventh chords, then explore their inversions.', icon: Layers3, color: 'pink', keyboard: keyboardAvailable },
      { id: 'harmonic-function', title: 'Harmonic function', description: 'Follow the roles chords play in a key and how they form progressions.', icon: Waypoints, color: 'blue', keyboard: keyboardAvailable },
      { id: 'circle-of-fifths', title: 'Circle of fifths', description: 'See how keys, accidentals and relative minors fit together.', icon: Circle, color: 'mint', keyboard: keyboardAvailable },
      { id: 'counterpoint', title: 'Counterpoint', description: 'Study how independent melodic lines work together.', icon: ListMusic, color: 'amber', keyboard: keyboardAvailable },
    ],
  },
  {
    title: 'Studio',
    workspaces: [
      { id: 'composition', title: 'Composition', description: 'Explore a future workspace for developing musical ideas.', icon: Guitar, color: 'pink', keyboard: keyboardAvailable },
      { id: 'practice-room', title: 'Practice room', description: 'Build fluency with targeted theory exercises as they become available.', icon: Sigma, color: 'accent', keyboard: { mode: 'disabled', reason: 'The keyboard will be available when a practice activity enables it.' } },
    ],
  },
  {
    title: 'Personal',
    workspaces: [
      { id: 'learning-progress', title: 'Learning progress', description: 'Your progress will appear here once completed exercises can be recorded.', icon: TrendingUp, color: 'mint' },
      { id: 'settings', title: 'Settings', description: 'Application preferences will be available here as features are added.', icon: Settings2, color: 'blue' },
    ],
  },
] satisfies { title: string; workspaces: Workspace[] }[]

const workspaces = [dashboard, ...workspaceGroups.flatMap((group) => group.workspaces)]

export function resolveWorkspace(hash: string): Workspace {
  return workspaces.find((workspace) => hash === '#/' + workspace.id) ?? dashboard
}
