// ============================================================================
// ACTIVE DB — routes to the correct storage provider based on mode.
// Modes:
//   'offline' → VaultDB  (in-memory, AES-256-GCM encrypted)
//   'sync'    → RxDBWrapper (RxDB with M365 sync)
//   'm365'    → DataverseDB (Microsoft 365 / Dataverse)
// ============================================================================
import { STORAGE_MODE_KEY } from '../config.js'
import { OfflineDB }        from './offline.js'
import { DataverseDB }      from './m365.js'
import { VaultDB }          from '../vault/VaultDB.js'
import { RxDBWrapper }      from '../sync/RxDBWrapper.js'

export { OfflineDB, DataverseDB, VaultDB, RxDBWrapper }
export { openDatabase, seedDatabase } from './offline.js'
export { getMsalApp }                 from './m365.js'

const _stored = localStorage.getItem(STORAGE_MODE_KEY)
let _activeMode = (_stored === 'm365') ? 'm365' : 
                  (_stored === 'sync') ? 'sync' : 
                  (_stored === 'offline') ? 'offline' : 'offline'

function resolveDB(mode) {
  if (mode === 'm365')    return DataverseDB
  if (mode === 'sync')    return RxDBWrapper
  if (mode === 'offline') return VaultDB
  return VaultDB // default
}

export let DB = resolveDB(_activeMode)

export function setStorageMode(mode) {
  _activeMode = mode
  DB = resolveDB(mode)
  localStorage.setItem(STORAGE_MODE_KEY, mode)
}

export function getStorageMode() { return _activeMode }
