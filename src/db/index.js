// ============================================================================
// ACTIVE DB — whichever provider is currently selected
// Import { DB } from here throughout the app.
// ============================================================================
import { STORAGE_MODE_KEY } from '../config.js'
import { OfflineDB } from './offline.js'
import { DataverseDB } from './m365.js'

export { OfflineDB, DataverseDB }
export { openDatabase, seedDatabase } from './offline.js'
export { getMsalApp } from './m365.js'

let _activeMode = localStorage.getItem(STORAGE_MODE_KEY) || 'offline'
export let DB = _activeMode === 'm365' ? DataverseDB : OfflineDB

export function setStorageMode(mode) {
  _activeMode = mode
  DB = mode === 'm365' ? DataverseDB : OfflineDB
  localStorage.setItem(STORAGE_MODE_KEY, mode)
}

export function getStorageMode() { return _activeMode }
