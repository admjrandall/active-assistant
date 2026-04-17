import { DataverseAdapter } from './adapters/dataverse.js'
import { SupabaseAdapter }   from './adapters/supabase.js'
import { FirebaseAdapter }   from './adapters/firebase.js'
import { SharePointAdapter } from './adapters/sharepoint.js'
import { CustomRestAdapter } from './adapters/custom-rest.js'
import { DATAVERSE_SCHEMA }  from '../config.js'

export const DB_ADAPTER_KEY = 'aa-db-adapter'

export const ADAPTER_TYPES = {
  dataverse:    { label: 'Microsoft Dataverse',  class: DataverseAdapter,  icon: '☁️' },
  supabase:     { label: 'Supabase',              class: SupabaseAdapter,   icon: '🟢' },
  firebase:     { label: 'Firebase / Firestore',  class: FirebaseAdapter,   icon: '🔥' },
  sharepoint:   { label: 'SharePoint Lists',      class: SharePointAdapter, icon: '📋' },
  'custom-rest':{ label: 'Custom REST API',       class: CustomRestAdapter, icon: '🔌' },
}

let _activeAdapter = null

export const getAdapterConfig = () => {
  const stored = localStorage.getItem(DB_ADAPTER_KEY)
  if (!stored) return { type: 'dataverse' }
  try { return JSON.parse(stored) } catch { return { type: 'dataverse' } }
}

export const setAdapterConfig = (type, config) => {
  localStorage.setItem(DB_ADAPTER_KEY, JSON.stringify({ type, config }))
  _activeAdapter = null
}

export const clearAdapterConfig = () => {
  localStorage.removeItem(DB_ADAPTER_KEY)
  _activeAdapter = null
}

export const getAdapter = () => {
  if (_activeAdapter) return _activeAdapter

  const { type, config } = getAdapterConfig()
  const entry = ADAPTER_TYPES[type]
  if (!entry) throw new Error(`Unknown adapter type: ${type}`)

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

export const listAdapters = () =>
  Object.entries(ADAPTER_TYPES).map(([type, meta]) => ({ type, ...meta }))
