# GUIDE: Multi-Database Adapter System

> **Goal:** Allow users to swap out Microsoft 365 Dataverse for other database backends
> via a pluggable adapter system. Dataverse remains the default. Users configure their
> adapter and credentials through a new "Database Connection" UI in the app.
>
> **Status:** Nothing from this guide exists yet. `src/db/m365.js` is the only backend.
>
> **Prerequisites:** Cloud mode working. GUIDE-cloud-offline-sync.md recommended first
> (offline queue is adapter-agnostic and works with all adapters).

---

## Architecture Overview

```
src/db/
├── adapters/
│   ├── base.js           ← Interface contract all adapters must satisfy
│   ├── dataverse.js      ← Existing m365.js refactored as an adapter class
│   ├── supabase.js       ← Supabase (PostgreSQL) REST adapter
│   ├── firebase.js       ← Google Firestore REST adapter (no SDK — keeps single-file)
│   ├── sharepoint.js     ← SharePoint Lists REST adapter
│   └── custom-rest.js    ← Generic configurable REST adapter
├── adapterRegistry.js    ← Registers adapters, resolves active one from config
├── index.js              ← UPDATED: cloud mode uses registry
└── m365.js               ← Kept for backwards compatibility, exports DataverseDB
```

**Config storage:** `localStorage['aa-db-adapter']` holds `{ type, config }` as JSON.
The `config` object contains credentials. For non-sensitive adapters this is fine.
For adapters with API keys, keys are stored as-is in localStorage — acceptable for a
single-user, single-device, single-file app where localStorage is origin-scoped.

> **Security note:** If using the app on a shared computer, use the offline mode or ensure
> you clear localStorage on sign-out. API keys in localStorage are readable by any JS on
> the same origin, so do not inject untrusted third-party scripts.

---

## Step 1: Create the Adapter Base Interface

Create **`src/db/adapters/base.js`**:

```javascript
// ============================================================================
// BASE ADAPTER — Interface contract for all database adapters.
// Each adapter must implement every method below.
// ============================================================================

export class BaseAdapter {
  constructor(config) {
    if (new.target === BaseAdapter) {
      throw new Error('BaseAdapter is abstract — extend it, do not instantiate directly.')
    }
    this.config = config
  }

  // Generate a unique ID for new records
  generateId() {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  // Retrieve all records from a collection
  // Returns: Promise<Array<Object>>
  async getAll(collection) {
    throw new Error(`${this.constructor.name}.getAll() not implemented`)
  }

  // Get a single record by ID (throws on not found)
  // Returns: Promise<Object>
  async getById(collection, id) {
    throw new Error(`${this.constructor.name}.getById() not implemented`)
  }

  // Insert or update a record (upsert by id)
  // Returns: Promise<Object> — the saved record
  async put(collection, data) {
    throw new Error(`${this.constructor.name}.put() not implemented`)
  }

  // Delete a record by ID
  // Returns: Promise<void>
  async delete(collection, id) {
    throw new Error(`${this.constructor.name}.delete() not implemented`)
  }

  // Test the connection — should resolve on success, reject with message on failure
  // Returns: Promise<{ ok: true, message: string }>
  async testConnection() {
    throw new Error(`${this.constructor.name}.testConnection() not implemented`)
  }
}
```

---

## Step 2: Refactor Dataverse as an Adapter

Create **`src/db/adapters/dataverse.js`** (extracted from `src/db/m365.js`):

```javascript
// ============================================================================
// DATAVERSE ADAPTER — Microsoft 365 Dataverse via MSAL + Web API
// Migrated from src/db/m365.js to the adapter pattern.
// ============================================================================
import { PublicClientApplication } from '@azure/msal-browser'
import { BaseAdapter } from './base.js'

export class DataverseAdapter extends BaseAdapter {
  constructor(config) {
    // config: { clientId, tenantId, url }
    super(config)
    this._msalInstance = null
    this._columnMaps   = config.columnMaps   || {}
    this._jsonFields   = config.jsonFields   || {}
    this._tables       = config.tables       || {}
  }

  _getMsalApp() {
    if (this._msalInstance) return this._msalInstance
    this._msalInstance = new PublicClientApplication({
      auth: {
        clientId: this.config.clientId,
        authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
    })
    return this._msalInstance
  }

  async _getToken() {
    const app = this._getMsalApp()
    const accounts = app.getAllAccounts()
    if (accounts.length === 0) throw new Error('No active MSAL account. Please sign in.')
    const request = { scopes: [`${this.config.url}/.default`], account: accounts[0] }
    try {
      const r = await app.acquireTokenSilent(request)
      return r.accessToken
    } catch {
      const r = await app.acquireTokenPopup(request)
      return r.accessToken
    }
  }

  async _fetch(endpoint, options = {}) {
    const token = await this._getToken()
    const base  = `${this.config.url}/api/data/v9.2`
    const headers = {
      'Authorization': `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'Prefer': 'return=representation',
      ...options.headers,
    }
    const res = await fetch(`${base}/${endpoint}`, { ...options, headers })
    if (!res.ok) {
      let msg = res.statusText
      try { const b = await res.json(); if (b.error?.message) msg = b.error.message } catch {}
      throw new Error(`Dataverse ${res.status}: ${msg}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  _toDataverse(collection, item) {
    const map = this._columnMaps[collection] || {}
    const jsonF = this._jsonFields[collection] || []
    const out = {}
    Object.keys(item).forEach(k => {
      if (k === 'isNew') return
      const col = map[k]
      if (col) out[col] = jsonF.includes(k) && item[k] !== null ? JSON.stringify(item[k]) : item[k]
    })
    return out
  }

  _fromDataverse(collection, record) {
    const map = this._columnMaps[collection] || {}
    const jsonF = this._jsonFields[collection] || []
    const out = {}
    Object.entries(map).forEach(([appKey, dvCol]) => {
      let val = record[dvCol]
      if (jsonF.includes(appKey) && typeof val === 'string') {
        try { val = JSON.parse(val) } catch { val = Array.isArray(val) ? [] : {} }
      }
      out[appKey] = val
    })
    return out
  }

  async getAll(collection) {
    const table = this._tables[collection]
    if (!table) throw new Error(`Unknown collection: ${collection}`)
    const result = await this._fetch(table)
    return (result?.value || []).map(r => this._fromDataverse(collection, r))
  }

  async getById(collection, id) {
    const table = this._tables[collection]
    const safe  = encodeURIComponent(String(id))
    const result = await this._fetch(`${table}(${safe})`)
    return this._fromDataverse(collection, result)
  }

  async put(collection, data) {
    if (!data?.id) throw new Error(`DataverseAdapter.put requires id for ${collection}`)
    const record = { ...data, lastModified: new Date().toISOString() }

    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'put', record)
      return record
    }

    try {
      await this.getById(collection, record.id)
      const table = this._tables[collection]
      const safe  = encodeURIComponent(String(record.id))
      const dv    = this._toDataverse(collection, record)
      await this._fetch(`${table}(${safe})`, { method: 'PATCH', body: JSON.stringify(dv) })
      return record
    } catch (err) {
      if (String(err.message).includes('404') || String(err.message).includes('Not Found')) {
        const table = this._tables[collection]
        const dv    = this._toDataverse(collection, record)
        const created = await this._fetch(table, { method: 'POST', body: JSON.stringify(dv) })
        return this._fromDataverse(collection, created)
      }
      throw err
    }
  }

  async delete(collection, id) {
    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'delete', { id, lastModified: new Date().toISOString() })
      return
    }
    const table = this._tables[collection]
    const safe  = encodeURIComponent(String(id))
    await this._fetch(`${table}(${safe})`, { method: 'DELETE' })
  }

  async testConnection() {
    try {
      await this._fetch('WhoAmI')
      return { ok: true, message: 'Connected to Dataverse successfully' }
    } catch (err) {
      throw new Error(`Dataverse connection failed: ${err.message}`)
    }
  }
}
```

---

## Step 3: Create the Supabase Adapter

Create **`src/db/adapters/supabase.js`**:

```javascript
// ============================================================================
// SUPABASE ADAPTER — PostgreSQL via Supabase REST API
// Uses Supabase's PostgREST API directly (no SDK — keeps build single-file).
// config: { url, anonKey, serviceKey (optional) }
// Table names must match your Supabase schema — set via config.tables.
// ============================================================================
import { BaseAdapter } from './base.js'

export class SupabaseAdapter extends BaseAdapter {
  constructor(config) {
    // config: { url, anonKey, tables: { projects: 'aa_projects', ... } }
    super(config)
    this._tables = config.tables || {}
  }

  _headers(method = 'GET') {
    const h = {
      'apikey': this.config.anonKey,
      'Authorization': `Bearer ${this.config.anonKey}`,
      'Accept': 'application/json',
    }
    if (method !== 'GET') {
      h['Content-Type'] = 'application/json'
      h['Prefer'] = 'return=representation'
    }
    return h
  }

  _table(collection) {
    const t = this._tables[collection] || collection
    return `${this.config.url}/rest/v1/${t}`
  }

  async getAll(collection) {
    const res = await fetch(`${this._table(collection)}?select=*`, {
      headers: this._headers()
    })
    if (!res.ok) throw new Error(`Supabase getAll ${collection}: ${res.status} ${res.statusText}`)
    return res.json()
  }

  async getById(collection, id) {
    const res = await fetch(`${this._table(collection)}?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: this._headers()
    })
    if (!res.ok) throw new Error(`Supabase getById: ${res.status}`)
    const rows = await res.json()
    if (!rows.length) throw new Error(`404: ${collection}/${id} not found`)
    return rows[0]
  }

  async put(collection, data) {
    if (!data?.id) throw new Error(`SupabaseAdapter.put requires id for ${collection}`)

    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'put', data)
      return data
    }

    const record = { ...data, last_modified: new Date().toISOString() }

    // Upsert — Supabase supports this natively via Prefer: resolution=merge-duplicates
    const res = await fetch(this._table(collection), {
      method: 'POST',
      headers: {
        ...this._headers('POST'),
        'Prefer': 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(record),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Supabase put ${collection}: ${res.status} ${err}`)
    }
    const rows = await res.json()
    return Array.isArray(rows) ? rows[0] : rows
  }

  async delete(collection, id) {
    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'delete', { id })
      return
    }

    const res = await fetch(
      `${this._table(collection)}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: this._headers('DELETE') }
    )
    if (!res.ok) throw new Error(`Supabase delete: ${res.status}`)
  }

  async testConnection() {
    try {
      // Hit the health check endpoint
      const res = await fetch(`${this.config.url}/rest/v1/`, {
        headers: this._headers()
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, message: 'Connected to Supabase successfully' }
    } catch (err) {
      throw new Error(`Supabase connection failed: ${err.message}`)
    }
  }
}
```

> **Supabase table setup:** Create tables in Supabase dashboard or via SQL matching your
> app schema. Recommended naming: `aa_projects`, `aa_tasks`, `aa_people`, etc.
> Enable Row Level Security (RLS) and set appropriate policies for your use case.

---

## Step 4: Create the Firebase Adapter

Create **`src/db/adapters/firebase.js`**:

```javascript
// ============================================================================
// FIREBASE / FIRESTORE ADAPTER — Uses Firestore REST API directly.
// No Firebase SDK — avoids inflating the single-file build.
// config: { projectId, apiKey, idToken (obtained via Firebase Auth REST) }
// ============================================================================
import { BaseAdapter } from './base.js'

const FIRESTORE_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

export class FirebaseAdapter extends BaseAdapter {
  constructor(config) {
    // config: { projectId, apiKey, idToken (Firebase Auth ID token) }
    super(config)
    this._idToken = config.idToken || null
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' }
    if (this._idToken) h['Authorization'] = `Bearer ${this._idToken}`
    return h
  }

  // Convert Firestore document fields to flat JS object
  _fromFirestore(doc) {
    const out = {}
    if (!doc.fields) return out
    Object.entries(doc.fields).forEach(([k, v]) => {
      if (v.stringValue !== undefined) out[k] = v.stringValue
      else if (v.integerValue !== undefined) out[k] = Number(v.integerValue)
      else if (v.doubleValue !== undefined) out[k] = v.doubleValue
      else if (v.booleanValue !== undefined) out[k] = v.booleanValue
      else if (v.nullValue !== undefined) out[k] = null
      else if (v.arrayValue !== undefined) {
        out[k] = (v.arrayValue.values || []).map(av => {
          if (av.stringValue !== undefined) return av.stringValue
          if (av.integerValue !== undefined) return Number(av.integerValue)
          return av
        })
      }
    })
    // Extract ID from document name
    if (doc.name) out.id = doc.name.split('/').pop()
    return out
  }

  // Convert flat JS object to Firestore document fields
  _toFirestore(data) {
    const fields = {}
    Object.entries(data).forEach(([k, v]) => {
      if (k === 'id') return // id is in the document path
      if (v === null || v === undefined) fields[k] = { nullValue: null }
      else if (typeof v === 'boolean') fields[k] = { booleanValue: v }
      else if (typeof v === 'number') {
        if (Number.isInteger(v)) fields[k] = { integerValue: String(v) }
        else fields[k] = { doubleValue: v }
      } else if (Array.isArray(v)) {
        fields[k] = {
          arrayValue: {
            values: v.map(item =>
              typeof item === 'string'
                ? { stringValue: item }
                : { stringValue: JSON.stringify(item) }
            )
          }
        }
      } else if (typeof v === 'object') {
        fields[k] = { stringValue: JSON.stringify(v) }
      } else {
        fields[k] = { stringValue: String(v) }
      }
    })
    return { fields }
  }

  _base() {
    return FIRESTORE_BASE(this.config.projectId)
  }

  async getAll(collection) {
    const res = await fetch(`${this._base()}/${collection}?key=${this.config.apiKey}`, {
      headers: this._headers()
    })
    if (!res.ok) throw new Error(`Firebase getAll ${collection}: ${res.status}`)
    const data = await res.json()
    return (data.documents || []).map(d => this._fromFirestore(d))
  }

  async getById(collection, id) {
    const res = await fetch(
      `${this._base()}/${collection}/${id}?key=${this.config.apiKey}`,
      { headers: this._headers() }
    )
    if (res.status === 404) throw new Error(`404: ${collection}/${id} not found`)
    if (!res.ok) throw new Error(`Firebase getById: ${res.status}`)
    return this._fromFirestore(await res.json())
  }

  async put(collection, data) {
    if (!data?.id) throw new Error(`FirebaseAdapter.put requires id`)

    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'put', data)
      return data
    }

    const record = { ...data, lastModified: new Date().toISOString() }
    const body = this._toFirestore(record)

    // PATCH with updateMask to avoid overwriting unset fields
    const fieldPaths = Object.keys(body.fields).map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
    const res = await fetch(
      `${this._base()}/${collection}/${record.id}?key=${this.config.apiKey}&${fieldPaths}`,
      { method: 'PATCH', headers: this._headers(), body: JSON.stringify(body) }
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Firebase put: ${res.status} ${err}`)
    }
    return this._fromFirestore(await res.json())
  }

  async delete(collection, id) {
    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'delete', { id })
      return
    }

    const res = await fetch(
      `${this._base()}/${collection}/${id}?key=${this.config.apiKey}`,
      { method: 'DELETE', headers: this._headers() }
    )
    if (!res.ok && res.status !== 404) throw new Error(`Firebase delete: ${res.status}`)
  }

  async testConnection() {
    try {
      const res = await fetch(
        `${this._base()}?key=${this.config.apiKey}&pageSize=1`,
        { headers: this._headers() }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, message: 'Connected to Firebase/Firestore successfully' }
    } catch (err) {
      throw new Error(`Firebase connection failed: ${err.message}`)
    }
  }
}
```

---

## Step 5: Create the SharePoint Lists Adapter

Create **`src/db/adapters/sharepoint.js`**:

```javascript
// ============================================================================
// SHAREPOINT LISTS ADAPTER — M365 SharePoint Lists via Graph API
// Uses the same MSAL app as Dataverse for authentication.
// config: { clientId, tenantId, siteUrl, listMaps: { projects: 'AA Projects', ... } }
// ============================================================================
import { PublicClientApplication } from '@azure/msal-browser'
import { BaseAdapter } from './base.js'

export class SharePointAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this._msalInstance = null
    this._listMaps = config.listMaps || {} // app collection name → SharePoint list name
    this._listIdCache = {}
  }

  async _getToken() {
    if (!this._msalInstance) {
      this._msalInstance = new PublicClientApplication({
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false }
      })
    }
    const accounts = this._msalInstance.getAllAccounts()
    if (!accounts.length) throw new Error('No MSAL account. Please sign in.')
    try {
      const r = await this._msalInstance.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/.default'],
        account: accounts[0]
      })
      return r.accessToken
    } catch {
      const r = await this._msalInstance.acquireTokenPopup({
        scopes: ['https://graph.microsoft.com/.default']
      })
      return r.accessToken
    }
  }

  async _fetch(path, options = {}) {
    const token = await this._getToken()
    const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      }
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`SharePoint ${res.status}: ${err}`)
    }
    if (res.status === 204) return null
    return res.json()
  }

  _siteBase() {
    // Extract hostname and path from siteUrl
    const url = new URL(this.config.siteUrl)
    return `/sites/${url.hostname}:${url.pathname}`
  }

  async _getListId(collection) {
    if (this._listIdCache[collection]) return this._listIdCache[collection]
    const listName = this._listMaps[collection] || collection
    const data = await this._fetch(`${this._siteBase()}:/lists?$filter=displayName eq '${listName}'`)
    if (!data.value?.length) throw new Error(`SharePoint list '${listName}' not found`)
    this._listIdCache[collection] = data.value[0].id
    return data.value[0].id
  }

  _fromSharePoint(item) {
    // SharePoint items have fields in item.fields
    const f = item.fields || item
    const out = { ...f }
    // Map SharePoint system ID to app ID
    if (f.id !== undefined && !f.appId) out.id = String(f.id)
    // Parse JSON fields stored as text
    Object.keys(out).forEach(k => {
      if (typeof out[k] === 'string') {
        if (out[k].startsWith('[') || out[k].startsWith('{')) {
          try { out[k] = JSON.parse(out[k]) } catch {}
        }
      }
    })
    return out
  }

  _toSharePoint(data) {
    const out = { ...data }
    delete out.id // SP manages its own internal ID
    if (data.id) out.appId = data.id // store our app ID separately
    // Stringify arrays/objects
    Object.keys(out).forEach(k => {
      if (Array.isArray(out[k]) || (out[k] !== null && typeof out[k] === 'object')) {
        out[k] = JSON.stringify(out[k])
      }
    })
    return out
  }

  async getAll(collection) {
    const listId = await this._getListId(collection)
    const data = await this._fetch(`${this._siteBase()}:/lists/${listId}/items?expand=fields`)
    return (data.value || []).map(item => this._fromSharePoint(item))
  }

  async getById(collection, id) {
    const listId = await this._getListId(collection)
    // Find by appId field
    const data = await this._fetch(
      `${this._siteBase()}:/lists/${listId}/items?expand=fields&$filter=fields/appId eq '${id}'`
    )
    if (!data.value?.length) throw new Error(`404: ${collection}/${id} not found`)
    return this._fromSharePoint(data.value[0])
  }

  async put(collection, data) {
    if (!data?.id) throw new Error(`SharePointAdapter.put requires id`)

    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'put', data)
      return data
    }

    const listId = await this._getListId(collection)
    const spFields = this._toSharePoint({ ...data, lastModified: new Date().toISOString() })

    // Check if exists
    try {
      const existing = await this.getById(collection, data.id)
      // Update — need SP internal ID
      const spInternalId = existing._spId
      await this._fetch(`${this._siteBase()}:/lists/${listId}/items/${spInternalId}/fields`, {
        method: 'PATCH',
        body: JSON.stringify(spFields),
      })
    } catch (err) {
      if (String(err.message).includes('404')) {
        // Create
        await this._fetch(`${this._siteBase()}:/lists/${listId}/items`, {
          method: 'POST',
          body: JSON.stringify({ fields: spFields }),
        })
      } else throw err
    }
    return data
  }

  async delete(collection, id) {
    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'delete', { id })
      return
    }

    const listId = await this._getListId(collection)
    try {
      const existing = await this.getById(collection, id)
      const spInternalId = existing._spId
      await this._fetch(`${this._siteBase()}:/lists/${listId}/items/${spInternalId}`, {
        method: 'DELETE'
      })
    } catch (err) {
      if (!String(err.message).includes('404')) throw err
    }
  }

  async testConnection() {
    try {
      await this._fetch(`${this._siteBase()}`)
      return { ok: true, message: 'Connected to SharePoint successfully' }
    } catch (err) {
      throw new Error(`SharePoint connection failed: ${err.message}`)
    }
  }
}
```

---

## Step 6: Create the Custom REST Adapter

Create **`src/db/adapters/custom-rest.js`**:

```javascript
// ============================================================================
// CUSTOM REST ADAPTER — Generic REST API adapter
// Expects a backend that follows REST conventions:
//   GET    /baseUrl/{collection}          → { data: [] }
//   GET    /baseUrl/{collection}/{id}     → { data: {} }
//   POST   /baseUrl/{collection}          → { data: {} }  (create)
//   PUT    /baseUrl/{collection}/{id}     → { data: {} }  (update)
//   DELETE /baseUrl/{collection}/{id}     → 204
//
// config: {
//   baseUrl: 'https://your-api.example.com/api',
//   headers: { 'X-Api-Key': 'your-key', 'Authorization': 'Bearer ...' },
//   collectionMap: { projects: 'projects', tasks: 'tasks', ... }  // optional renames
// }
// ============================================================================
import { BaseAdapter } from './base.js'

export class CustomRestAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this._collectionMap = config.collectionMap || {}
  }

  _collection(name) {
    return this._collectionMap[name] || name
  }

  async _fetch(path, options = {}) {
    const res = await fetch(`${this.config.baseUrl}/${path}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...this.config.headers,
        ...options.headers,
      }
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Custom REST ${res.status}: ${err}`)
    }
    if (res.status === 204) return null
    const body = await res.json()
    // Support both { data: [] } and plain [] responses
    return body.data !== undefined ? body.data : body
  }

  async getAll(collection) {
    return this._fetch(this._collection(collection))
  }

  async getById(collection, id) {
    const data = await this._fetch(`${this._collection(collection)}/${encodeURIComponent(id)}`)
    if (!data) throw new Error(`404: ${collection}/${id} not found`)
    return data
  }

  async put(collection, data) {
    if (!data?.id) throw new Error(`CustomRestAdapter.put requires id`)

    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'put', data)
      return data
    }

    const record = { ...data, lastModified: new Date().toISOString() }

    try {
      await this.getById(collection, record.id)
      // Exists — update
      return this._fetch(`${this._collection(collection)}/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        body: JSON.stringify(record),
      })
    } catch (err) {
      if (String(err.message).includes('404')) {
        // Create
        return this._fetch(this._collection(collection), {
          method: 'POST',
          body: JSON.stringify(record),
        })
      }
      throw err
    }
  }

  async delete(collection, id) {
    if (!navigator.onLine) {
      const { enqueueOperation } = await import('../../utils/backgroundSync.js')
      await enqueueOperation(collection, 'delete', { id })
      return
    }

    await this._fetch(`${this._collection(collection)}/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
  }

  async testConnection() {
    try {
      // Try to fetch one collection as a health check
      const firstCollection = Object.keys(this._collectionMap)[0] || 'projects'
      await this.getAll(firstCollection)
      return { ok: true, message: 'Connected to custom REST API successfully' }
    } catch (err) {
      throw new Error(`Custom REST connection failed: ${err.message}`)
    }
  }
}
```

---

## Step 7: Create the Adapter Registry

Create **`src/db/adapterRegistry.js`**:

```javascript
// ============================================================================
// ADAPTER REGISTRY — Manages adapter registration and instantiation.
// Active adapter config is persisted in localStorage under 'aa-db-adapter'.
// ============================================================================
import { DataverseAdapter } from './adapters/dataverse.js'
import { SupabaseAdapter }   from './adapters/supabase.js'
import { FirebaseAdapter }   from './adapters/firebase.js'
import { SharePointAdapter } from './adapters/sharepoint.js'
import { CustomRestAdapter } from './adapters/custom-rest.js'
import { DATAVERSE_SCHEMA }  from '../config.js'

export const DB_ADAPTER_KEY = 'aa-db-adapter'

// All registered adapter types
export const ADAPTER_TYPES = {
  dataverse:   { label: 'Microsoft Dataverse',  class: DataverseAdapter,  icon: '☁️' },
  supabase:    { label: 'Supabase',              class: SupabaseAdapter,   icon: '🟢' },
  firebase:    { label: 'Firebase / Firestore',  class: FirebaseAdapter,   icon: '🔥' },
  sharepoint:  { label: 'SharePoint Lists',      class: SharePointAdapter, icon: '📋' },
  'custom-rest': { label: 'Custom REST API',     class: CustomRestAdapter, icon: '🔌' },
}

let _activeAdapter = null

// Get the currently configured adapter config from localStorage
export const getAdapterConfig = () => {
  const stored = localStorage.getItem(DB_ADAPTER_KEY)
  if (!stored) return { type: 'dataverse' } // default
  try { return JSON.parse(stored) } catch { return { type: 'dataverse' } }
}

// Persist adapter config
export const setAdapterConfig = (type, config) => {
  localStorage.setItem(DB_ADAPTER_KEY, JSON.stringify({ type, config }))
  _activeAdapter = null // force re-instantiation
}

// Clear adapter config (revert to default)
export const clearAdapterConfig = () => {
  localStorage.removeItem(DB_ADAPTER_KEY)
  _activeAdapter = null
}

// Get (or create) the active adapter instance
export const getAdapter = () => {
  if (_activeAdapter) return _activeAdapter

  const { type, config } = getAdapterConfig()
  const entry = ADAPTER_TYPES[type]
  if (!entry) throw new Error(`Unknown adapter type: ${type}`)

  // For Dataverse (default), merge in the schema config
  const resolvedConfig = type === 'dataverse'
    ? {
        ...config,
        columnMaps: DATAVERSE_SCHEMA.columnMaps,
        jsonFields: DATAVERSE_SCHEMA.jsonFields,
        tables:     DATAVERSE_SCHEMA.tables,
      }
    : config

  _activeAdapter = new entry.class(resolvedConfig)
  return _activeAdapter
}

// List all available adapters (for UI display)
export const listAdapters = () =>
  Object.entries(ADAPTER_TYPES).map(([type, meta]) => ({ type, ...meta }))
```

---

## Step 8: Update src/db/index.js to Use the Registry

Replace the contents of **`src/db/index.js`**:

```javascript
// ============================================================================
// DATABASE ROUTER — Two-mode system using adapter registry for cloud mode.
// Mode 1: Offline → VaultDB (in-memory, AES-256-GCM encrypted)
// Mode 2: Cloud   → Adapter from adapterRegistry (Dataverse by default)
// ============================================================================
import { VaultDB }     from '../vault/VaultDB.js'
import { getAdapter }  from './adapterRegistry.js'
import { STORAGE_MODE_KEY } from '../config.js'

let currentMode = null
let currentDB   = null

export const getStorageMode = () => {
  if (currentMode) return currentMode
  const stored = localStorage.getItem(STORAGE_MODE_KEY)
  if (stored === 'offline' || stored === 'cloud') {
    currentMode = stored
    return stored
  }
  return null
}

export const setStorageMode = (mode) => {
  if (mode !== 'offline' && mode !== 'cloud') {
    throw new Error(`Invalid storage mode: ${mode}. Must be 'offline' or 'cloud'.`)
  }
  currentMode = mode
  localStorage.setItem(STORAGE_MODE_KEY, mode)
  currentDB = mode === 'offline' ? VaultDB : getAdapter()
}

export const getDB = () => {
  if (!currentDB) {
    const mode = getStorageMode()
    if (mode === 'offline') currentDB = VaultDB
    else if (mode === 'cloud') currentDB = getAdapter()
  }
  return currentDB
}

// Keep DataverseDB export for backwards compat with App.jsx imports
export const DataverseDB = {
  get getAll()     { return getAdapter().getAll.bind(getAdapter()) },
  get getById()    { return getAdapter().getById.bind(getAdapter()) },
  get put()        { return getAdapter().put.bind(getAdapter()) },
  get delete()     { return getAdapter().delete.bind(getAdapter()) },
  get generateId() { return getAdapter().generateId.bind(getAdapter()) },
}
```

---

## Step 9: Create the Database Config Modal UI

Create **`src/components/DatabaseConfigModal.jsx`**:

```jsx
// ============================================================================
// DATABASE CONFIG MODAL — UI for selecting and configuring a database adapter.
// Accessible from the Environment Hub menu.
// ============================================================================
import React, { useState, useEffect } from 'react'
import {
  ADAPTER_TYPES,
  getAdapterConfig,
  setAdapterConfig,
  listAdapters,
  getAdapter,
} from '../db/adapterRegistry.js'

const FIELD_DEFS = {
  dataverse: [
    { key: 'clientId',  label: 'Azure App Client ID',  type: 'text',     required: true },
    { key: 'tenantId',  label: 'Azure Tenant ID',       type: 'text',     required: true },
    { key: 'url',       label: 'Dataverse URL',          type: 'url',      required: true,
      placeholder: 'https://yourorg.crm.dynamics.com' },
  ],
  supabase: [
    { key: 'url',      label: 'Supabase Project URL',  type: 'url',  required: true,
      placeholder: 'https://xxxx.supabase.co' },
    { key: 'anonKey',  label: 'Anon/Public Key',        type: 'password', required: true },
  ],
  firebase: [
    { key: 'projectId', label: 'Firebase Project ID', type: 'text',     required: true },
    { key: 'apiKey',    label: 'Firebase Web API Key', type: 'password', required: true },
    { key: 'idToken',   label: 'Firebase ID Token (optional)', type: 'password', required: false,
      help: 'Leave blank for public/unauthenticated access' },
  ],
  sharepoint: [
    { key: 'clientId', label: 'Azure App Client ID', type: 'text', required: true },
    { key: 'tenantId', label: 'Azure Tenant ID',     type: 'text', required: true },
    { key: 'siteUrl',  label: 'SharePoint Site URL', type: 'url',  required: true,
      placeholder: 'https://yourtenant.sharepoint.com/sites/yoursite' },
  ],
  'custom-rest': [
    { key: 'baseUrl',       label: 'API Base URL',           type: 'url',  required: true },
    { key: 'authHeader',    label: 'Auth Header Value',       type: 'password', required: false,
      placeholder: 'Bearer your-token-here' },
  ],
}

export const DatabaseConfigModal = ({ isOpen, onClose, onSaved }) => {
  const current = getAdapterConfig()
  const [selectedType, setSelectedType] = useState(current.type || 'dataverse')
  const [formValues, setFormValues]   = useState(current.config || {})
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState(null)
  const [saving, setSaving]           = useState(false)

  useEffect(() => {
    if (isOpen) {
      const c = getAdapterConfig()
      setSelectedType(c.type || 'dataverse')
      setFormValues(c.config || {})
      setTestResult(null)
    }
  }, [isOpen])

  const handleTypeChange = (type) => {
    setSelectedType(type)
    setFormValues({})
    setTestResult(null)
  }

  const handleFieldChange = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Build adapter config from form
      const config = buildConfig()
      const { class: AdapterClass } = ADAPTER_TYPES[selectedType]
      const adapter = new AdapterClass(config)
      const result = await adapter.testConnection()
      setTestResult({ ok: true, message: result.message })
    } catch (err) {
      setTestResult({ ok: false, message: err.message })
    } finally {
      setTesting(false)
    }
  }

  const buildConfig = () => {
    const config = { ...formValues }
    // Build custom headers for custom-rest
    if (selectedType === 'custom-rest' && formValues.authHeader) {
      config.headers = { 'Authorization': formValues.authHeader }
    }
    return config
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      setAdapterConfig(selectedType, buildConfig())
      onSaved?.()
      showToast?.('Database adapter saved')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const fields = FIELD_DEFS[selectedType] || []

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Database Connection</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Adapter selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Database Type</label>
            <div className="grid grid-cols-1 gap-2">
              {listAdapters().map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all
                    ${selectedType === type
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                    }
                  `}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="font-medium">{label}</span>
                  {type === 'dataverse' && (
                    <span className="ml-auto text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Default</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Fields */}
          {fields.length > 0 && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-300">Connection Settings</label>
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {f.label} {f.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type={f.type || 'text'}
                    value={formValues[f.key] || ''}
                    onChange={e => handleFieldChange(f.key, e.target.value)}
                    placeholder={f.placeholder || ''}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  {f.help && <p className="text-xs text-slate-500 mt-1">{f.help}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              testResult.ok
                ? 'bg-green-500/10 text-green-300 border border-green-500/20'
                : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-slate-700">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

## Step 10: Wire DatabaseConfigModal into App.jsx

Add to **`src/App.jsx`**:

### Imports:
```javascript
import { DatabaseConfigModal } from './components/DatabaseConfigModal.jsx'
```

### State:
```javascript
const [isDbConfigOpen, setIsDbConfigOpen] = useState(false)
```

### JSX (add alongside other modals):
```jsx
<DatabaseConfigModal
  isOpen={isDbConfigOpen}
  onClose={() => setIsDbConfigOpen(false)}
  onSaved={() => {
    showToast('Database adapter saved. Reloading...')
    setTimeout(() => window.location.reload(), 1500)
  }}
/>
```

### Environment Hub menu (add button):
```jsx
{storageMode === 'cloud' && (
  <button
    onClick={() => { setIsEnvMenuOpen(false); setIsDbConfigOpen(true) }}
    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
  >
    🔌 Database Connection
  </button>
)}
```

---

## Verification Steps

### 1. Dataverse (default — no changes to existing behavior)
```bash
npm run dev
```
Log in via cloud mode → verify app loads data as before.

### 2. Supabase
1. Create a Supabase project at supabase.com
2. Create tables: `aa_projects`, `aa_tasks`, `aa_people`, `aa_departments`, `aa_clients`, `aa_communications`
   Each table needs an `id` UUID column (primary key) + the app's field names as columns
3. Open DB Config modal → select Supabase → enter URL + anon key → Test → Save
4. Reload → create a project → verify in Supabase Table Editor

### 3. Firebase
1. Create a Firebase project → enable Firestore
2. Set Firestore rules to allow read/write (or configure auth)
3. Open DB Config modal → Firebase → enter projectId + apiKey → Test → Save

### 4. Custom REST
1. Ensure your API returns `{ data: [...] }` or plain `[...]` from GET endpoints
2. Configure base URL + auth header → Test → Save
