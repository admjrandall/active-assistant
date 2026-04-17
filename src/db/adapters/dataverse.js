import { PublicClientApplication } from '@azure/msal-browser'
import { BaseAdapter } from './base.js'

export class DataverseAdapter extends BaseAdapter {
  constructor(config) {
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
