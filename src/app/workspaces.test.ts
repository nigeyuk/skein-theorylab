import { describe, expect, it } from 'vitest'
import { dashboard, resolveWorkspace, workspaceGroups } from './workspaces'

const workspaces = [dashboard, ...workspaceGroups.flatMap(({ workspaces }) => workspaces)]
const routes = [
  'dashboard', 'content-manager', 'cheat-sheets', 'fundamentals', 'scales-modes', 'intervals', 'chords',
  'harmonic-function', 'circle-of-fifths', 'counterpoint', 'composition',
  'practice-room', 'learning-progress', 'settings',
]

describe('workspace routing', () => {
  it('registers each workspace exactly once', () => {
    expect(workspaces.map(({ id }) => id)).toEqual(routes)
  })

  it.each(routes)('resolves the %s deep link', (id) => {
    expect(resolveWorkspace('#/' + id).id).toBe(id)
  })

  it.each(['', '#/unknown', '#/chords/extra'])('falls back to the dashboard for %j', (hash) => {
    expect(resolveWorkspace(hash)).toBe(dashboard)
  })
})
