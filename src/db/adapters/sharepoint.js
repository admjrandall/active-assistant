import { PublicClientApplication } from '@azure/msal-browser'
import { BaseAdapter } from './base.js'

export class SharePointAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this._msalInstance = null
    this._listMaps = config.listMaps || {}
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
    const f = item.fields || item
    const out = { ...f }
    if (f.id !== undefined && !f.appId) out.id = String(f.id)
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
    delete out.id
    if (data.id) out.appId = data.id
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

    try {
      const existing = await this.getById(collection, data.id)
      const spInternalId = existing._spId
      await this._fetch(`${this._siteBase()}:/lists/${listId}/items/${spInternalId}/fields`, {
        method: 'PATCH',
        body: JSON.stringify(spFields),
      })
    } catch (err) {
      if (String(err.message).includes('404')) {
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
