// ============================================================================
// VAULT CRYPTO — AES-256-GCM encryption using the browser Web Crypto API.
// Nothing here touches disk, IndexedDB, or localStorage.
// The key is derived in memory from the user's password and discarded on lock.
// ============================================================================

const ALGO        = 'AES-GCM'
const KEY_BITS    = 256
const PBKDF2_ITER = 310_000   // OWASP 2023 minimum for PBKDF2-SHA-256
const SALT_BYTES  = 32
const IV_BYTES    = 12

// ── Helpers ──────────────────────────────────────────────────────────────────
const buf2b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const b642buf = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))

// ── Key derivation ────────────────────────────────────────────────────────────
export async function deriveKey(password, salt) {
  const enc         = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  )
}

// ── Encrypt ───────────────────────────────────────────────────────────────────
// Returns a JSON string: { v, salt, iv, data } — all values base64-encoded.
export async function encryptVault(dataObject, password) {
  const salt      = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv        = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key       = await deriveKey(password, salt)
  const plaintext = new TextEncoder().encode(JSON.stringify(dataObject))
  const cipher    = await crypto.subtle.encrypt({ name: ALGO, iv }, key, plaintext)

  return JSON.stringify({
    v:    1,
    salt: buf2b64(salt),
    iv:   buf2b64(iv),
    data: buf2b64(cipher),
  })
}

// ── Decrypt ───────────────────────────────────────────────────────────────────
// Throws DOMException('OperationError') on wrong password — caught in VaultUnlock.
export async function decryptVault(payload, password) {
  const { v, salt, iv, data } = JSON.parse(payload)
  if (v !== 1) throw new Error('Unknown vault version — cannot decrypt.')
  const key    = await deriveKey(password, b642buf(salt))
  const plain  = await crypto.subtle.decrypt(
    { name: ALGO, iv: b642buf(iv) },
    key,
    b642buf(data)
  )
  return JSON.parse(new TextDecoder().decode(plain))
}

export async function rotateVaultPassword(snapshot, oldPassword, newPassword) {
  const verificationEnvelope = await encryptVault(snapshot, oldPassword)
  const decryptedSnapshot = await decryptVault(verificationEnvelope, oldPassword)
  return encryptVault(decryptedSnapshot, newPassword)
}
