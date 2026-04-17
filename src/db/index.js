import { VaultDB }    from '../vault/VaultDB.js'
import { getAdapter } from './adapterRegistry.js'
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

// Backwards-compat: DataverseDB proxy used throughout App.jsx
export const DataverseDB = {
  get generateId() { return getAdapter().generateId.bind(getAdapter()) },
  get getAll()     { return getAdapter().getAll.bind(getAdapter()) },
  get getById()    { return getAdapter().getById.bind(getAdapter()) },
  get put()        { return getAdapter().put.bind(getAdapter()) },
  get delete()     { return getAdapter().delete.bind(getAdapter()) },
}
