import { BaseAdapter } from './base.js'

const FIRESTORE_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`

export class FirebaseAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this._idToken = config.idToken || null
  }

  _headers() {
    const h = { 'Content-Type': 'application/json' }
    if (this._idToken) h['Authorization'] = `Bearer ${this._idToken}`
    return h
  }

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
    if (doc.name) out.id = doc.name.split('/').pop()
    return out
  }

  _toFirestore(data) {
    const fields = {}
    Object.entries(data).forEach(([k, v]) => {
      if (k === 'id') return
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

  _base() { return FIRESTORE_BASE(this.config.projectId) }

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
