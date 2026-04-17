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
      return this._fetch(`${this._collection(collection)}/${encodeURIComponent(record.id)}`, {
        method: 'PUT',
        body: JSON.stringify(record),
      })
    } catch (err) {
      if (String(err.message).includes('404')) {
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
      const firstCollection = Object.keys(this._collectionMap)[0] || 'projects'
      await this.getAll(firstCollection)
      return { ok: true, message: 'Connected to custom REST API successfully' }
    } catch (err) {
      throw new Error(`Custom REST connection failed: ${err.message}`)
    }
  }
}
