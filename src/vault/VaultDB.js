// ============================================================================
// VAULT DB — in-memory database with the exact same interface as OfflineDB.
// Data NEVER touches disk, IndexedDB, or localStorage.
// All state lives in JavaScript memory and is cleared when the tab closes
// or when lock() is called explicitly.
// ============================================================================

const STORES = ['projects', 'tasks', 'people', 'departments', 'clients', 'communications']

// Single in-module state object — one vault per browser tab session
const _state   = Object.fromEntries(STORES.map(s => [s, []]))
let   _onChange = null   // debounced auto-save callback set by App after unlock

// ── Public DB interface (mirrors OfflineDB exactly) ──────────────────────────

export const VaultDB = {

  // --- Core CRUD ---

  getAll: (store) =>
    Promise.resolve([..._state[store]]),

  put: (store, val) => {
    const idx = _state[store].findIndex(i => i.id === val.id)
    if (idx >= 0) _state[store][idx] = { ...val }
    else          _state[store].push({ ...val })
    _onChange?.()
    return Promise.resolve(val)
  },

  delete: (store, id) => {
    _state[store] = _state[store].filter(i => i.id !== id)
    _onChange?.()
    return Promise.resolve()
  },

 generateId: () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return 'v-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
},


  // --- Vault-specific methods (not on OfflineDB) ---

  // Populate in-memory state from a decrypted snapshot
  loadSnapshot: (snapshot) => {
    STORES.forEach(s => {
      _state[s] = Array.isArray(snapshot?.[s]) ? [...snapshot[s]] : []
    })
  },

  // Capture current state for encryption and Gist push
  getSnapshot: () =>
    Object.fromEntries(STORES.map(s => [s, [..._state[s]]])),

  // Register the auto-save callback (called after every put/delete)
  onDataChange: (cb) => { _onChange = cb },

  // Wipe all in-memory data and remove the callback (called on lock)
  clear: () => {
    STORES.forEach(s => { _state[s] = [] })
    _onChange = null
  },

  // Marker so App can detect vault mode without checking string names
  isVault: true,
}
