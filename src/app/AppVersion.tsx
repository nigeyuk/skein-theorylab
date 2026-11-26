import { Tag } from 'lucide-react'
import { version } from '../../package.json'

export function AppVersion() {
  return <div className="sidebar-footer"><Tag size={16} aria-hidden="true" /> Version <span>{version}</span></div>
}
