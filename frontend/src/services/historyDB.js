import { openDB } from 'idb'

const DB_NAME    = 'cardioscan-history'
const DB_VERSION = 1
const STORE      = 'records'

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('timestamp', 'timestamp')
    },
  })
}

export async function saveRecord(record) {
  const db = await getDB()
  await db.put(STORE, record)
}

export async function getAllRecords() {
  const db = await getDB()
  const all = await db.getAllFromIndex(STORE, 'timestamp')
  return all.reverse() // newest first
}

export async function deleteRecord(id) {
  const db = await getDB()
  await db.delete(STORE, id)
}

export async function clearAllRecords() {
  const db = await getDB()
  await db.clear(STORE)
}
