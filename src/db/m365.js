// ============================================================================
// MICROSOFT 365 / DATAVERSE DATABASE LAYER
// Uses @azure/msal-browser for authentication and the Dataverse Web API.
// Relies on dynamic configuration from config.js (setup via AuthGate).
// ============================================================================
import { PublicClientApplication } from '@azure/msal-browser'
import { getM365Config, DATAVERSE_SCHEMA } from '../config.js'

let msalInstance = null

export const getMsalApp = () => {
  if (msalInstance) return msalInstance

  const config = getM365Config()
  if (!config) throw new Error("M365 configuration is missing. Please configure via AuthGate.")

  msalInstance = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage', // Better persistence for returning users
      storeAuthStateInCookie: false,
    }
  })
  return msalInstance
}

const getAccessToken = async () => {
  const app = getMsalApp()
  const config = getM365Config()
  const accounts = app.getAllAccounts()
  
  if (accounts.length === 0) {
    throw new Error("No active MSAL account. Please sign in.")
  }
  
  const request = {
    scopes: [`${config.url}/.default`],
    account: accounts[0]
  }

  try {
    const response = await app.acquireTokenSilent(request)
    return response.accessToken
  } catch (error) {
    console.warn("Token acquisition requires user interaction")
    // Fallback to popup if silent acquisition fails (e.g., expired refresh token)
    const response = await app.acquireTokenPopup(request)
    return response.accessToken
  }
}

// Helper to make authenticated requests to the Dataverse Web API
const fetchFromDataverse = async (endpoint, options = {}) => {
  const token = await getAccessToken()
  const config = getM365Config()
  const baseUrl = `${config.url}/api/data/v9.2`
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'Prefer': 'return=representation', // Forces Dataverse to return the created/updated record
    ...options.headers
  }

  const response = await fetch(`${baseUrl}/${endpoint}`, { ...options, headers })
  
  if (!response.ok) {
    let errorDetail = response.statusText
    try {
      const errBody = await response.json()
      if (errBody.error && errBody.error.message) {
        errorDetail = errBody.error.message
      }
    } catch (e) { /* non-json error */ }
    throw new Error(`Dataverse API Error (${response.status}): ${errorDetail}`)
  }
  
  if (response.status === 204) return null
  return response.json()
}

// Map Application Model -> Dataverse Model
const mapToDataverse = (collectionName, item) => {
  const map = DATAVERSE_SCHEMA.columnMaps[collectionName]
  const jsonFields = DATAVERSE_SCHEMA.jsonFields[collectionName] || []
  const dataverseRecord = {}

  Object.keys(item).forEach(key => {
    // Skip internal flags
    if (key === 'isNew') return 
    
    const targetCol = map[key]
    if (targetCol) {
      if (jsonFields.includes(key) && item[key] !== null) {
        dataverseRecord[targetCol] = JSON.stringify(item[key])
      } else {
        dataverseRecord[targetCol] = item[key]
      }
    }
  })
  return dataverseRecord
}

// Map Dataverse Model -> Application Model
const mapToApp = (collectionName, record) => {
  const map = DATAVERSE_SCHEMA.columnMaps[collectionName]
  const jsonFields = DATAVERSE_SCHEMA.jsonFields[collectionName] || []
  const appItem = {}

  Object.entries(map).forEach(([appKey, dvCol]) => {
    let val = record[dvCol]
    if (jsonFields.includes(appKey) && typeof val === 'string') {
      try {
        val = JSON.parse(val)
      } catch (e) {
        val = Array.isArray(val) ? [] : {}
      }
    }
    appItem[appKey] = val
  })
  return appItem
}

// ── CRUD Operations ─────────────────────────────────────────────────────────────

export const DataverseDB = {
  // Generate a random GUID for new records if not utilizing Dataverse auto-gen
generateId: () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  
  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
},

  getAll: async (collection) => {
    const table = DATAVERSE_SCHEMA.tables[collection]
    if (!table) throw new Error(`Unknown collection: ${collection}`)
    
    const result = await fetchFromDataverse(`${table}`)
    if (!result || !result.value) return []
    return result.value.map(record => mapToApp(collection, record))
  },

getById: async (collection, id) => {
  const table = DATAVERSE_SCHEMA.tables[collection]
  const map = DATAVERSE_SCHEMA.columnMaps[collection]
  const safeId = encodeURIComponent(String(id))
  const result = await fetchFromDataverse(`${table}(${safeId})`)
  return mapToApp(collection, result)
},


  create: async (collection, data) => {
    const table = DATAVERSE_SCHEMA.tables[collection]
    const dvRecord = mapToDataverse(collection, data)
    
    const result = await fetchFromDataverse(`${table}`, {
      method: 'POST',
      body: JSON.stringify(dvRecord)
    })
    return mapToApp(collection, result)
  },

 update: async (collection, id, data) => {
  const table = DATAVERSE_SCHEMA.tables[collection]
  const dvRecord = mapToDataverse(collection, data)
  const safeId = encodeURIComponent(String(id))
  
  await fetchFromDataverse(`${table}(${safeId})`, {
    method: 'PATCH',
    body: JSON.stringify(dvRecord)
  })
  // Prefer=return=representation is set, but to ensure sync we merge client side
  return { ...data, id } 
},


delete: async (collection, id) => {
  const table = DATAVERSE_SCHEMA.tables[collection]
  const safeId = encodeURIComponent(String(id))
  await fetchFromDataverse(`${table}(${safeId})`, {
    method: 'DELETE'
  })
}

}