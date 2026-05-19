import { Platform } from 'react-native'

// IndexedDB is web-only. On native, taskCache.ts uses AsyncStorage instead.
if (Platform.OS !== 'web') {
  console.warn('db.ts: IndexedDB is not available on native. Use taskCache.ts AsyncStorage path.')
}

const DB_NAME = 'checkvist-app'
const DB_VERSION = 1

let _db: IDBDatabase | null = null

export function getDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('tasks')) {
        const store = db.createObjectStore('tasks', { keyPath: 'id' })
        store.createIndex('checklist_id', 'checklist_id')
        store.createIndex('parent_id', 'parent_id')
      }
      for (const name of ['lists', 'list_states', 'users', 'temp_objects', 'files_storage'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
    }
    req.onsuccess = () => {
      _db = req.result
      resolve(_db)
    }
    req.onerror = () => reject(req.error)
  })
}

export function dbGetAll<T>(storeName: string): Promise<T[]> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        req.onsuccess = () => resolve(req.result as T[])
        req.onerror = () => reject(req.error)
      }),
  )
}

export function dbGetByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db
          .transaction(storeName, 'readonly')
          .objectStore(storeName)
          .index(indexName)
          .getAll(value)
        req.onsuccess = () => resolve(req.result as T[])
        req.onerror = () => reject(req.error)
      }),
  )
}

export function dbPutAll<T>(storeName: string, items: T[]): Promise<void> {
  if (!items.length) return Promise.resolve()
  return getDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        const store = tx.objectStore(storeName)
        for (const item of items) store.put(item)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}
