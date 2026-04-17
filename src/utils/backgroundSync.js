import Dexie from 'dexie'

const QUEUE_DB_NAME = 'aa-offline-queue'
const QUEUE_VERSION = 1

const queueDb = new Dexie(QUEUE_DB_NAME)
queueDb.version(QUEUE_VERSION).stores({
  queue: '++id, collection, operation, recordId, timestamp'
})

export const enqueueOperation = async (collection, operation, record) => {
  await queueDb.queue.add({
    collection,
    operation,
    recordId: record.id,
    payload: JSON.stringify(record),
    timestamp: new Date().toISOString(),
    attempts: 0,
  })
}

export const getPendingCount = async () => {
  return queueDb.queue.count()
}

export const drainQueue = async (db, onProgress) => {
  const entries = await queueDb.queue.orderBy('timestamp').toArray()
  const total = entries.length
  if (total === 0) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const entry of entries) {
    try {
      const record = JSON.parse(entry.payload)

      if (entry.operation === 'put') {
        let serverRecord = null
        try {
          serverRecord = await db.getById(entry.collection, record.id)
        } catch (e) {
          // 404 = not on server yet — safe to create
        }

        if (serverRecord && serverRecord.lastModified && record.lastModified) {
          const serverTime = new Date(serverRecord.lastModified).getTime()
          const localTime  = new Date(record.lastModified).getTime()
          if (serverTime > localTime) {
            console.warn(`[Sync] Skipping ${entry.collection}/${record.id}: server is newer`)
            await queueDb.queue.delete(entry.id)
            synced++
            onProgress?.({ done: synced + failed, total, skipped: true })
            continue
          }
        }

        await db.put(entry.collection, record)
      } else if (entry.operation === 'delete') {
        try {
          await db.delete(entry.collection, record.id)
        } catch (e) {
          if (!String(e.message).includes('404')) throw e
        }
      }

      await queueDb.queue.delete(entry.id)
      synced++
      onProgress?.({ done: synced + failed, total })
    } catch (err) {
      console.error(`[Sync] Failed to sync ${entry.collection}/${entry.recordId}:`, err)
      await queueDb.queue.update(entry.id, { attempts: (entry.attempts || 0) + 1 })
      if ((entry.attempts || 0) >= 4) {
        await queueDb.queue.delete(entry.id)
      }
      failed++
      onProgress?.({ done: synced + failed, total, error: err.message })
    }
  }

  return { synced, failed }
}

export const clearQueue = async () => {
  await queueDb.queue.clear()
}

export const registerBackgroundSync = async () => {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.sync.register('aa-offline-sync')
  } catch (e) {
    console.warn('[BackgroundSync] Registration failed:', e)
  }
}
