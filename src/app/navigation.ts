import { create } from 'zustand'
import { resolveWorkspace } from './workspaces'

export const useNavigation = create<{ workspace: ReturnType<typeof resolveWorkspace> }>(() => ({
  workspace: resolveWorkspace(window.location.hash),
}))

window.addEventListener('hashchange', () => {
  useNavigation.setState({ workspace: resolveWorkspace(window.location.hash) })
})
