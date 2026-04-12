// ============================================================================
// M365 PROVIDER — Microsoft Dataverse via Web API
// ============================================================================
import { PublicClientApplication } from '@azure/msal-browser'
import { M365_CONFIG } from '../config.js'

let _msalApp = null
let _dvToken = null
let _dvTokenExpiry = 0

export function getMsalApp() {
  if (_msalApp) return _msalApp
  _msalApp = new PublicClientApplication({
    auth: {
      clientId:    M365_CONFIG.clientId,
      authority:   `https://login.microsoftonline.com/${M365_CONFIG.tenantId}`,
      redirectUri: window.location.href.split('?')[0],
    },
    cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
  })
  return _msalApp
}

async function getDataverseToken() {
  if (_dvToken && Date.now() < _dvTokenExpiry - 60000) return _dvToken
  const app = getMsalApp()
  const scope = `${M365_CONFIG.dataverseUrl}/.default`
  const accounts = app.getAllAccounts()
  let result
  try {
    result = await app.acquireTokenSilent({ scopes: [scope], account: accounts[0] })
  } catch (_) {
    result = await app.acquireTokenPopup({ scopes: [scope] })
  }
  _dvToken = result.accessToken
  _dvTokenExpiry = result.expiresOn?.getTime() || Date.now() + 3600000
  return _dvToken
}

function toDataverseRecord(storeName, localRecord) {
  const map = M365_CONFIG.columnMaps[storeName] || {}
  const jsonFields = M365_CONFIG.jsonFields[storeName] || []
  const out = {}
  for (const [localKey, dvCol] of Object.entries(map)) {
    if (localKey === 'id') continue
    let val = localRecord[localKey]
    if (val === undefined) continue
    if (jsonFields.includes(localKey)) val = JSON.stringify(val)
    out[dvCol] = val
  }
  return out
}

function fromDataverseRecord(storeName, dvRow) {
  const map = M365_CONFIG.columnMaps[storeName] || {}
  const jsonFields = M365_CONFIG.jsonFields[storeName] || []
  const out = {}
  for (const [localKey, dvCol] of Object.entries(map)) {
    let val = dvRow[dvCol]
    if (val === undefined || val === null) { out[localKey] = val; continue }
    if (jsonFields.includes(localKey)) { try { val = JSON.parse(val) } catch (_) {} }
    out[localKey] = val
  }
  const pkCol = map['id']
  if (pkCol && dvRow[pkCol]) out['id'] = dvRow[pkCol]
  return out
}

function dvTableUrl(storeName) {
  return `${M365_CONFIG.dataverseUrl}/api/data/v9.2/${M365_CONFIG.tables[storeName]}`
}

async function dvFetch(url, options = {}) {
  const token = await getDataverseToken()
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'Prefer': 'odata.include-annotations=*',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) { const body = await res.text().catch(() => ''); throw new Error(`Dataverse ${res.status}: ${body}`) }
  if (res.status === 204) return null
  return res.json()
}

export const DataverseDB = {
  generateId: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  }),

  getAll: async (storeName) => {
    const map  = M365_CONFIG.columnMaps[storeName] || {}
    const cols = Object.values(map).join(',')
    const data = await dvFetch(`${dvTableUrl(storeName)}?$select=${cols}`)
    return (data?.value || []).map(row => fromDataverseRecord(storeName, row))
  },

  put: async (storeName, localRecord) => {
    const map   = M365_CONFIG.columnMaps[storeName] || {}
    const pkCol = map['id']
    const pkVal = localRecord['id']
    const body  = toDataverseRecord(storeName, localRecord)
    if (pkVal) {
      await dvFetch(`${dvTableUrl(storeName)}(${pkVal})`, { method: 'PATCH', headers: { 'If-Match': '*' }, body: JSON.stringify(body) })
    } else {
      const res = await dvFetch(dvTableUrl(storeName), { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) })
      if (res && pkCol && res[pkCol]) localRecord['id'] = res[pkCol]
    }
    return localRecord
  },

  delete: async (storeName, id) => {
    await dvFetch(`${dvTableUrl(storeName)}(${id})`, { method: 'DELETE' })
  },
}
