import type { ContentRepository } from './repository'

export const userRoles = ['administrator', 'content-author', 'student', 'guest'] as const
export type UserRole = typeof userRoles[number]

export interface UserProfile {
  readonly id: string
  readonly displayName: string
  readonly role: UserRole
}

/** Profiles are resolved from an authenticated server session. */
export interface RemoteIdentity {
  currentProfile(): Promise<UserProfile | null>
}

/** The learning engine will define the record shape and idempotent merge rules. */
export interface LearningProgressSync<Record> {
  synchronise(input: { readonly cursor: string | null; readonly changes: readonly Record[] }): Promise<{
    readonly cursor: string
    readonly changes: readonly Record[]
  }>
}

/** Future remote integration seam. The server must authenticate and authorise every operation. */
export interface RemoteContentPlatform<ProgressRecord> extends RemoteIdentity {
  readonly repository: ContentRepository
  readonly progress: LearningProgressSync<ProgressRecord>
  exportAccountData(): Promise<Blob>
  deleteAccount(): Promise<void>
}
