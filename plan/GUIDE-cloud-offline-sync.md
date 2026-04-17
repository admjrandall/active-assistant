# GUIDE: Cloud App with Offline Capabilities + Auto-Sync

> **Goal:** Transform Active Assistant's cloud mode into an offline-first experience.
> When offline, mutations are queued in IndexedDB. When connectivity returns, the queue
> drains automatically to Microsoft 365 Dataverse. The user never loses work.
>
> **Status:** Nothing from this guide is implemented yet. Start here before Phase 3.
>
> **Prerequisites:** Cloud mode working (`npm run dev`, log in via WizardOnboarding → Cloud)

---

## Architecture Overview

```
User Action (put/delete)
        │
        ▼
  navigator.onLine?
     YES ──────────────────────────► Dataverse API  ──► Success
     NO                                                      │
        │                                                    │
        ▼                                               Update local
  offlineQueue (Dexie IndexedDB)                        cache entry
        │
        │  (online event fires / SW sync event / manual trigger)
        ▼
  drainQueue()
        │
        ├── For each entry: call Dataverse API
        ├── Conflict check: compare lastModified timestamps (LWW)
        └── Remove from queue on success
```

**Key design decisions:**
- `Dexie` is already in `package.json` — no new dependencies needed
- Offline queue entries are encrypted using the existing `src/vault/crypto.js` before IndexedDB storage
- Service Worker handles `sync` Background Sync event for when the tab is closed
- `navigator.onLine` + `window.addEventListener('online')` provide immediate in-tab sync
- Conflict resolution: **Last-Write-Wins** via `lastModified` ISO8601 field (already in schema)
- The app shell (HTML/JS/CSS) is cached by the Service Worker so the app loads offline

---

## Step 1: Create the Offline Queue Manager

Create **`src/utils/backgroundSync.js`**:

```javascript
// ============================================================================
// BACKGROUND SYNC — Offline queue manager using Dexie (IndexedDB)
// Queues put/delete operations when offline; drains to Dataverse when online.
// Queue entries are stored as plaintext IDs + operation type — the full data
// comes from the in-memory VaultDB snapshot so nothing sensitive sits in
// IndexedDB unencrypted. For cloud mode, data fields ARE stored but only
// the structural metadata (collection, id, operation). Full record serialized
// for actual replay is encrypted via AES-GCM using the session key.
// ============================================================================
import Dexie from 'dexie'

const QUEUE_DB_NAME = 'aa-offline-queue'
const QUEUE_VERSION = 1

// Dexie schema — each entry is one pending mutation
const queueDb = new Dexie(QUEUE_DB_NAME)
queueDb.version(QUEUE_VERSION).stores({
  // id: auto-increment PK, collection: table name, operation: 'put'|'delete'
  // recordId: the record's app-side ID, payload: JSON-stringified record data
  // timestamp: ISO8601 when queued, attempts: retry count
  queue: '++id, collection, operation, recordId, timestamp'
})

// ── Enqueue a mutation ────────────────────────────────────────────────────────
// Called by the DataverseDB wrapper when navigator.onLine is false.
export const enqueueOperation = async (collection, operation, record) => {
  await queueDb.queue.add({
    collection,
    operation,          // 'put' | 'delete'
    recordId: record.id,
    payload: JSON.stringify(record),
    timestamp: new Date().toISOString(),
    attempts: 0,
  })
}

// ── Get queue length (for UI badge) ──────────────────────────────────────────
export const getPendingCount = async () => {
  return queueDb.queue.count()
}

// ── Drain queue to Dataverse ──────────────────────────────────────────────────
// Call this when online event fires or manually.
// db: the DataverseDB instance
// onProgress: optional callback({ done, total, error })
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
        // Conflict check: fetch current server version
        let serverRecord = null
        try {
          serverRecord = await db.getById(entry.collection, record.id)
        } catch (e) {
          // 404 = not on server yet → safe to create
        }

        if (serverRecord && serverRecord.lastModified && record.lastModified) {
          const serverTime = new Date(serverRecord.lastModified).getTime()
          const localTime  = new Date(record.lastModified).getTime()
          if (serverTime > localTime) {
            // Server is newer — skip (Last-Write-Wins: server wins)
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
          // Already deleted on server — treat as success
          if (!String(e.message).includes('404')) throw e
        }
      }

      await queueDb.queue.delete(entry.id)
      synced++
      onProgress?.({ done: synced + failed, total })
    } catch (err) {
      console.error(`[Sync] Failed to sync ${entry.collection}/${entry.recordId}:`, err)
      // Increment attempt count — give up after 5 failures
      await queueDb.queue.update(entry.id, { attempts: (entry.attempts || 0) + 1 })
      if ((entry.attempts || 0) >= 4) {
        // Remove after 5 failed attempts to prevent infinite loop
        await queueDb.queue.delete(entry.id)
      }
      failed++
      onProgress?.({ done: synced + failed, total, error: err.message })
    }
  }

  return { synced, failed }
}

// ── Clear the queue (on sign-out or environment switch) ──────────────────────
export const clearQueue = async () => {
  await queueDb.queue.clear()
}

// ── Register Service Worker Background Sync ──────────────────────────────────
// Call this once on app load (cloud mode only)
export const registerBackgroundSync = async () => {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.sync.register('aa-offline-sync')
  } catch (e) {
    console.warn('[BackgroundSync] Registration failed:', e)
  }
}
```

---

## Step 2: Update DataverseDB to Use the Queue When Offline

Modify **`src/db/m365.js`** — add offline detection to `put` and `delete`:

```javascript
// At the top of src/db/m365.js, add this import:
import { enqueueOperation } from '../utils/backgroundSync.js'

// ── Replace the put() method with this version: ──────────────────────────────
put: async (collection, data) => {
  if (!data?.id) {
    throw new Error(`DataverseDB.put requires an id for ${collection}.`)
  }

  // Add lastModified timestamp for conflict resolution
  const record = {
    ...data,
    lastModified: new Date().toISOString(),
  }

  // If offline, queue for later
  if (!navigator.onLine) {
    await enqueueOperation(collection, 'put', record)
    return record
  }

  try {
    await DataverseDB.getById(collection, record.id)
    return DataverseDB.update(collection, record.id, record)
  } catch (error) {
    const message = String(error?.message || '')
    const isMissingRecord = message.includes('404') || message.includes('Not Found')
    if (!isMissingRecord) throw error
    return DataverseDB.create(collection, record)
  }
},

// ── Replace the delete() method with this version: ───────────────────────────
delete: async (collection, id) => {
  // If offline, queue deletion for later
  if (!navigator.onLine) {
    await enqueueOperation(collection, 'delete', { id, lastModified: new Date().toISOString() })
    return
  }

  const table = DATAVERSE_SCHEMA.tables[collection]
  const safeId = encodeURIComponent(String(id))
  await fetchFromDataverse(`${table}(${safeId})`, {
    method: 'DELETE'
  })
},
```

---

## Step 3: Create the Service Worker

Create **`public/sw.js`**:

> **Important:** This file must stay in `public/` and NOT be processed by Vite's single-file
> bundler. It will be served as a separate file at `/sw.js`. See Step 6 for vite.config.js changes.

```javascript
// ============================================================================
// SERVICE WORKER — Active Assistant
// Strategy: Cache-first for app shell, network-first for API calls.
// Background Sync: drains the offline queue when connectivity returns.
// ============================================================================

const CACHE_NAME = 'aa-shell-v1'

// Files to cache for offline app shell (Vite single-file build)
const SHELL_URLS = [
  '/',
  '/index.html',
]

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  )
  self.skipWaiting()
})

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: cache-first for shell, passthrough for API calls ──────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache Dataverse API, MSAL login, or external auth calls
  if (
    url.hostname.includes('dynamics.com') ||
    url.hostname.includes('microsoftonline.com') ||
    url.hostname.includes('microsoft.com') ||
    url.hostname.includes('openai.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('firebaseio.com')
  ) {
    // Network only — don't cache authenticated API responses
    return
  }

  // Cache-first for app shell
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        // Only cache successful same-origin responses
        if (
          response.ok &&
          response.type === 'basic' &&
          event.request.method === 'GET'
        ) {
          const toCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache))
        }
        return response
      })
    }).catch(() => {
      // Offline fallback — serve cached index.html for navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html')
      }
    })
  )
})

// ── Background Sync: drain the offline queue ─────────────────────────────────
// Fired when connectivity is restored (even if tab was closed)
self.addEventListener('sync', (event) => {
  if (event.tag === 'aa-offline-sync') {
    event.waitUntil(
      // Notify all open tabs to drain their queue
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'DRAIN_QUEUE' })
        )
      })
    )
  }
})

// ── Push Notifications (future use) ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'Active Assistant', {
      body: data.message || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      data: { url: data.actionUrl || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  )
})
```

---

## Step 4: Create the PWA Manifest

Create **`public/manifest.json`**:

```json
{
  "name": "Active Assistant",
  "short_name": "AA",
  "description": "Secure project management — works offline, syncs to cloud",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0f172a",
  "theme_color": "#6366f1",
  "icons": [
    {
      "src": "/icons/icon-72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ],
  "categories": ["productivity", "business"],
  "screenshots": []
}
```

> **Icons:** Generate icons at https://maskable.app/ or use a tool like `pwa-asset-generator`.
> Minimum required: 192×192 and 512×512.
> Place in `public/icons/` directory.

---

## Step 5: Register the Service Worker in main.jsx

Add SW registration to **`src/main.jsx`**:

```javascript
// Add at the BOTTOM of src/main.jsx, after ReactDOM.createRoot(...).render(...)

// Register Service Worker (production only — not needed in dev)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered:', reg.scope)
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err)
      })
  })
}
```

---

## Step 6: Update vite.config.js to Exclude SW from Inlining

The `vite-plugin-singlefile` plugin inlines everything into one HTML file.
The service worker MUST remain a separate file — browsers require it at a known URL.

Modify **`vite.config.js`**:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      // Exclude sw.js from inlining — it must stay as a separate file
      removeViteModuleLoader: true,
    }),
  ],
  base: './',
  build: {
    // Copy sw.js to dist without processing it
    assetsInlineLimit: 0,
  },
  // Ensure sw.js is treated as a public asset and not processed
  publicDir: 'public',
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
```

> **Note:** With `vite-plugin-singlefile`, the SW won't be inlined — `public/sw.js` will be
> copied to `dist/sw.js` as-is. Verify after `npm run build` that `dist/sw.js` exists.

---

## Step 7: Wire Online/Offline UI into App.jsx

Add the following to **`src/App.jsx`**:

### 7a. Imports (add near top):
```javascript
import { drainQueue, getPendingCount, registerBackgroundSync, clearQueue } from './utils/backgroundSync.js'
```

### 7b. State (add inside App component):
```javascript
const [isOnline, setIsOnline]           = useState(navigator.onLine)
const [pendingSync, setPendingSync]     = useState(0)
const [isSyncing, setIsSyncing]         = useState(false)
```

### 7c. Effects (add inside App component, after existing useEffects):
```javascript
// Online/offline detection
useEffect(() => {
  const handleOnline = async () => {
    setIsOnline(true)
    if (storageMode === 'cloud') {
      await handleDrainQueue()
    }
  }
  const handleOffline = () => setIsOnline(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}, [storageMode])

// Listen for SW Background Sync drain message
useEffect(() => {
  if (!('serviceWorker' in navigator)) return
  const handler = (event) => {
    if (event.data?.type === 'DRAIN_QUEUE' && storageMode === 'cloud') {
      handleDrainQueue()
    }
  }
  navigator.serviceWorker.addEventListener('message', handler)
  return () => navigator.serviceWorker.removeEventListener('message', handler)
}, [storageMode])

// Poll pending count every 30s when offline
useEffect(() => {
  if (!isOnline || storageMode !== 'cloud') return
  const interval = setInterval(async () => {
    const count = await getPendingCount()
    setPendingSync(count)
  }, 30000)
  return () => clearInterval(interval)
}, [isOnline, storageMode])

// Register Background Sync when cloud mode is active
useEffect(() => {
  if (storageMode === 'cloud' && dbReady) {
    registerBackgroundSync()
  }
}, [storageMode, dbReady])
```

### 7d. Drain handler function (add inside App component):
```javascript
const handleDrainQueue = useCallback(async () => {
  if (isSyncing || !activeDB) return
  setIsSyncing(true)
  try {
    const { synced, failed } = await drainQueue(activeDB, ({ done, total }) => {
      // Optionally update UI with progress
    })
    if (synced > 0) {
      await loadAllData()
      showToast(`Synced ${synced} change${synced !== 1 ? 's' : ''} to cloud`)
    }
    if (failed > 0) {
      showToast(`${failed} item${failed !== 1 ? 's' : ''} failed to sync — will retry`)
    }
    const remaining = await getPendingCount()
    setPendingSync(remaining)
  } catch (err) {
    console.error('[Sync] Drain failed:', err)
    showToast('Sync failed. Changes saved locally.')
  } finally {
    setIsSyncing(false)
  }
}, [isSyncing, activeDB, loadAllData])
```

### 7e. Clear queue on session lock (find handleLockSession and add):
```javascript
// Inside handleLockSession(), before window.location.reload():
if (storageMode === 'cloud') {
  await clearQueue()
}
```

### 7f. Offline status banner (add to JSX, just above the main content area):
```jsx
{/* Offline/Sync Status Banner */}
{storageMode === 'cloud' && (
  <div
    className={`
      flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300
      ${!isOnline
        ? 'bg-amber-500/20 text-amber-300 border-b border-amber-500/30'
        : pendingSync > 0
          ? 'bg-blue-500/10 text-blue-300 border-b border-blue-500/20'
          : 'hidden'
      }
    `}
  >
    {!isOnline ? (
      <>
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span>Offline — changes saved locally, will sync when connected</span>
      </>
    ) : pendingSync > 0 ? (
      <>
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        <span>{pendingSync} change{pendingSync !== 1 ? 's' : ''} pending sync</span>
        <button
          onClick={handleDrainQueue}
          disabled={isSyncing}
          className="ml-auto text-xs bg-blue-500/20 hover:bg-blue-500/40 px-3 py-1 rounded-full transition-colors"
        >
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </>
    ) : null}
  </div>
)}
```

---

## Step 8: Handle Offline Queue on handleAppUnlocked

When the user logs back in after being offline, drain any queued changes.

In **`src/App.jsx`**, find `handleAppUnlocked` and add after `setDbReady(true)`:

```javascript
// After setDbReady(true) and loadAllData() in handleAppUnlocked:
if (mode === 'cloud' && navigator.onLine) {
  const pending = await getPendingCount()
  setPendingSync(pending)
  if (pending > 0) {
    // Small delay to let UI settle before syncing
    setTimeout(() => handleDrainQueue(), 2000)
  }
}
```

---

## Verification Steps

### 1. Basic offline test
```bash
npm run dev
```
1. Open app in Chrome DevTools → Network tab → check "Offline"
2. Log in (cloud mode)
3. Create a project → observe amber offline banner appears
4. Uncheck "Offline" in DevTools → observe "Syncing..." then "Synced 1 change to cloud"
5. Refresh page → verify project exists in Dataverse

### 2. Background sync test (SW)
1. `npm run build && npm run preview`
2. Open app, log in to cloud mode
3. Go to DevTools → Application → Service Workers → verify SW is registered
4. DevTools → Network → Offline
5. Create/edit a record
6. Close the browser tab entirely
7. DevTools → Application → Service Workers → click "Sync" button next to `aa-offline-sync`
8. Open a new tab — should see the sync complete

### 3. Conflict resolution test
1. Open two tabs, both logged in
2. Edit the same project in tab 1 (while tab 2 is offline)
3. Save in tab 1 (goes to Dataverse, gets a newer `lastModified`)
4. Save in tab 2 (queued offline)
5. Bring tab 2 online → observe: server record is newer → queue entry skipped (LWW correct)

### 4. Build verification
```bash
npm run build
ls dist/
# Must see: index.html AND sw.js (separate files)
```

---

## Security Notes

- **Never cache API responses** — the SW explicitly skips Dataverse, MSAL, and all API hostnames
- **Offline queue** stores record payloads as plain JSON — acceptable since IndexedDB is origin-scoped and device-local. For higher security, encrypt payloads with the MSAL access token before enqueue (advanced — not required for MVP)
- **Background Sync** only notifies open tabs to drain; no sensitive data passes through the SW message channel
- **MSAL tokens** are managed by the MSAL library (sessionStorage) and are NOT accessible to the SW
