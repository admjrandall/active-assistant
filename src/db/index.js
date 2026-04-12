// ============================================================================
// ACTIVE DB — routes to the correct storage provider based on mode.
// Modes:
//   'vault'  → VaultDB  (in-memory, AES-256-GCM encrypted Gist — DEFAULT)
//   'm365'   → DataverseDB (Microsoft 365 / Dataverse)
// The legacy 'offline' mode (plain IndexedDB) is retained only as a fallback
// during local development (localhost) and maps to OfflineDB.
// ============================================================================
import { STORAGE_MODE_KEY } from '../config.js'
import { OfflineDB }        from './offline.js'
import { DataverseDB }      from './m365.js'
import { VaultDB }          from '../vault/VaultDB.js'

export { OfflineDB, DataverseDB, VaultDB }
export { openDatabase, seedDatabase } from './offline.js'
export { getMsalApp }                 from './m365.js'

// Default to vault mode — never fall back to unencrypted IndexedDB in production
// Migrate stale 'offline' from old app versions; only 'vault' and 'm365' are valid
const _stored = localStorage.getItem(STORAGE_MODE_KEY)
let _activeMode = (_stored === 'm365') ? 'm365' : 'vault'

function resolveDB(mode) {
  if (mode === 'm365')    return DataverseDB
  if (mode === 'offline') return OfflineDB   // dev fallback only
  return VaultDB                             // 'vault' (default)
}

export let DB = resolveDB(_activeMode)

export function setStorageMode(mode) {
  _activeMode = mode
  DB = resolveDB(mode)
  localStorage.setItem(STORAGE_MODE_KEY, mode)
}

export function getStorageMode() { return _activeMode }
