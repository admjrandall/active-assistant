import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

const ensureOptionsJSON = (options) => (
  options && typeof options === 'object' && 'optionsJSON' in options
    ? options
    : { optionsJSON: options }
)

const assertSupport = () => {
  if (!browserSupportsWebAuthn()) {
    throw new Error('WebAuthn is not supported in this browser.')
  }
}

export const isWebAuthnSupported = () => browserSupportsWebAuthn()

export const isPlatformAuthenticatorAvailable = async () => {
  if (!browserSupportsWebAuthn()) {
    return false
  }

  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

export const supportsWebAuthnAutofill = async () => {
  if (!browserSupportsWebAuthn()) {
    return false
  }

  try {
    return await browserSupportsWebAuthnAutofill()
  } catch {
    return false
  }
}

export const registerPasskey = async (options) => {
  assertSupport()
  return startRegistration(ensureOptionsJSON(options))
}

export const authenticateWithPasskey = async (options) => {
  assertSupport()
  return startAuthentication(ensureOptionsJSON(options))
}

export const serializeCredential = (credential) => {
  if (!credential) return null
  return JSON.parse(JSON.stringify(credential))
}

// ── Passkey Storage (Client-Side, No Server Required) ─────────────────────────

const PASSKEY_CRED_KEY = 'aa-passkey-credential'

const bufToBase64 = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))

export const savePasskeyCredential = (credentialId, rawId) => {
  localStorage.setItem(PASSKEY_CRED_KEY, JSON.stringify({
    id: credentialId,
    rawId: bufToBase64(rawId),
  }))
}

export const getStoredPasskeyCredential = () => {
  const stored = localStorage.getItem(PASSKEY_CRED_KEY)
  if (!stored) return null
  try { return JSON.parse(stored) } catch { return null }
}

export const clearPasskeyCredential = () => {
  localStorage.removeItem(PASSKEY_CRED_KEY)
}

export const hasEnrolledPasskey = () => !!getStoredPasskeyCredential()

export const enrollPasskey = async (userDisplayName = 'Active Assistant User') => {
  assertSupport()

  const challengeBuf = new Uint8Array(32)
  crypto.getRandomValues(challengeBuf)
  const challenge = bufToBase64(challengeBuf)

  const registrationOptions = {
    optionsJSON: {
      challenge,
      rp: {
        name: 'Active Assistant',
        id: window.location.hostname,
      },
      user: {
        id: bufToBase64(crypto.getRandomValues(new Uint8Array(16))),
        name: userDisplayName,
        displayName: userDisplayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7  },
        { type: 'public-key', alg: -257 },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    }
  }

  const credential = await startRegistration(registrationOptions)
  const rawIdBytes = Uint8Array.from(atob(credential.rawId), c => c.charCodeAt(0))
  savePasskeyCredential(credential.id, rawIdBytes)

  return { credentialId: credential.id, success: true }
}

export const verifyPasskey = async () => {
  assertSupport()

  const stored = getStoredPasskeyCredential()
  if (!stored) throw new Error('No passkey enrolled on this device')

  const challengeBuf = new Uint8Array(32)
  crypto.getRandomValues(challengeBuf)
  const challenge = bufToBase64(challengeBuf)

  const authOptions = {
    optionsJSON: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{
        type: 'public-key',
        id: stored.rawId,
      }],
      userVerification: 'required',
      timeout: 60000,
    }
  }

  await startAuthentication(authOptions)
  return true
}
