import { ContentError } from '../content/model'
import { applyLibraryMutations } from '../content/repository'
import type { LibraryEntry } from '../content/model'
import type { ContentRepository, LibraryMutation } from '../content/repository'

const store = 'resources'
// Keep the physical IndexedDB name so the same origin opens its existing library in place.
const localDatabaseName = 'skein-theorylab-content'

export function createIndexedDbContentRepository(
  name = localDatabaseName,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): ContentRepository {
  let connection: Promise<IDBDatabase> | undefined

  function open() {
    if (connection) return connection
    if (!factory) return Promise.reject(new ContentError('IndexedDB is unavailable. Allow local browser storage to use the content library.'))
    const opened = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(name, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore(store, { keyPath: 'record.id' }) }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new ContentError('Close other MyTheoryLab tabs and reload to open the library.'))
      request.onsuccess = () => {
        const database = request.result
        if (connection !== opened) { database.close(); return }
        database.onversionchange = () => { database.close(); connection = undefined }
        resolve(database)
      }
    })
    connection = opened
    void opened.catch(() => { if (connection === opened) connection = undefined })
    return opened
  }

  async function read<T>(get: (source: IDBObjectStore) => IDBRequest<T>) {
    const database = await open()
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(store, 'readonly')
      const request = get(transaction.objectStore(store))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  return {
    async list() {
      const entries: LibraryEntry[] = await read((source) => source.getAll())
      return entries.map(({ record, favourite, origin }) => ({ record, favourite, origin }))
    },
    get: (id) => read<LibraryEntry | undefined>((source) => source.get(id)),
    async commit(changes: readonly LibraryMutation[]) {
      if (!changes.length) return
      const database = await open()
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(store, 'readwrite')
        const source = transaction.objectStore(store)
        let failure: unknown
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(failure ?? transaction.error ?? new ContentError('The library update was cancelled.'))
        const request = source.getAll()
        request.onsuccess = () => {
          try {
            for (const [id, entry] of applyLibraryMutations(request.result as LibraryEntry[], changes)) {
              if (entry) source.put(entry)
              else source.delete(id)
            }
          } catch (error) {
            failure = error
            transaction.abort()
          }
        }
      })
    },
  }
}
