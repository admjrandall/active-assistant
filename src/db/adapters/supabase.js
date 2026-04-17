import { BaseAdapter } from './base.js'

export class SupabaseAdapter extends BaseAdapter {
  constructor(config) {
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
      const res = await fetch(`${this.config.url}/rest/v1/`, { headers: this._headers() })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return { ok: true, message: 'Connected to Supabase successfully' }
    } catch (err) {
      throw new Error(`Supabase connection failed: ${err.message}`)
    }
  }
}
