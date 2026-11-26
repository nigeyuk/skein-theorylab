import { ContentError, contentFingerprint } from './model'
import type { LibraryEntry, LibraryItem } from './model'

export type LibraryMutation =
  | { readonly kind: 'put'; readonly entry: LibraryEntry; readonly expectedRevision: number | null }
  | { readonly kind: 'delete'; readonly id: string; readonly expectedRevision: number }
  | { readonly kind: 'favourite'; readonly id: string; readonly value: boolean }

/** Storage and concurrency boundary. Remote implementations must enforce access on the server. */
export interface ContentRepository {
  list(): Promise<readonly LibraryItem[]>
  get(id: string): Promise<LibraryEntry | undefined>
  commit(changes: readonly LibraryMutation[]): Promise<void>
}

/** Apply an atomic batch to a snapshot. Adapters own serialisation and durable writes. */
export function applyLibraryMutations(existing: readonly LibraryEntry[], changes: readonly LibraryMutation[]) {
  const entries = new Map(existing.map((entry) => [entry.record.id, entry]))
  const changed = new Map<string, LibraryEntry | null>()
  for (const change of changes) {
    const id = change.kind === 'put' ? change.entry.record.id : change.id
    const current = entries.get(id)
    if (change.kind === 'favourite') {
      if (!current) throw new ContentError('The resource no longer exists.')
      const entry = { ...current, favourite: change.value }
      entries.set(id, entry)
      changed.set(id, entry)
      continue
    }

    if ((current?.record.revision ?? null) !== change.expectedRevision) {
      throw new ContentError('The library changed. Refresh it and review the operation again.')
    }
    if (current?.origin === 'bundled' || (change.kind === 'put' && change.entry.origin === 'bundled')) {
      throw new ContentError('Bundled resources are read-only.')
    }
    if (change.kind === 'delete') {
      entries.delete(id)
      changed.set(id, null)
      continue
    }
    const fingerprint = contentFingerprint(change.entry.record)
    if ([...entries.values()].some((entry) => entry.record.id !== id && contentFingerprint(entry.record) === fingerprint)) {
      throw new ContentError('This file content already belongs to another resource.')
    }
    const entry = { ...change.entry, favourite: current?.favourite ?? change.entry.favourite }
    entries.set(id, entry)
    changed.set(id, entry)
  }
  return changed
}
