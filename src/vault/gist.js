// ============================================================================
// GIST SERVICE — read and write the encrypted vault file to a private GitHub Gist.
// The PAT (Personal Access Token) needs only the `gist` scope.
// The Gist is private — invisible to everyone except the token owner.
// ============================================================================

const FILENAME = 'active-assistant-vault.dat'
const API_BASE = 'https://api.github.com'

function apiHeaders(token) {
  return {
    'Authorization':        `Bearer ${token}`,
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json',
  }
}

// ── Fetch encrypted payload from Gist ─────────────────────────────────────────
export async function fetchVault(token, gistId) {
  const res = await fetch(`${API_BASE}/gists/${gistId}`, {
    headers: apiHeaders(token),
  })
  if (res.status === 401) throw new Error('Invalid GitHub token. Check your PAT.')
  if (res.status === 404) throw new Error('Gist not found. Check the Gist ID.')
  if (!res.ok)            throw new Error(`Gist fetch failed (${res.status}).`)

  const gist = await res.json()
  const file = gist.files?.[FILENAME]
  if (!file) throw new Error(`Vault file "${FILENAME}" not found in this Gist.`)

  // GitHub truncates large files — follow the raw URL if needed
  if (file.truncated) {
    const raw = await fetch(file.raw_url)
    if (!raw.ok) throw new Error('Failed to fetch vault raw content.')
    return raw.text()
  }
  return file.content
}

// ── Push updated encrypted payload to Gist ────────────────────────────────────
export async function saveVault(token, gistId, encryptedPayload) {
  const res = await fetch(`${API_BASE}/gists/${gistId}`, {
    method:  'PATCH',
    headers: apiHeaders(token),
    body:    JSON.stringify({
      files: { [FILENAME]: { content: encryptedPayload } },
    }),
  })
  if (res.status === 401) throw new Error('Invalid GitHub token.')
  if (!res.ok)            throw new Error(`Vault save failed (${res.status}).`)
  return res.json()
}

// ── Create a brand-new private Gist and return its ID ─────────────────────────
export async function createVaultGist(token) {
  const res = await fetch(`${API_BASE}/gists`, {
    method:  'POST',
    headers: apiHeaders(token),
    body:    JSON.stringify({
      description: 'Active Assistant — encrypted vault (do not edit manually)',
      public:      false,
      files:       { [FILENAME]: { content: '{}' } },
    }),
  })
  if (res.status === 401) throw new Error('Invalid GitHub token.')
  if (!res.ok)            throw new Error(`Gist creation failed (${res.status}).`)
  const gist = await res.json()
  return gist.id
}

// ── Validate a token has gist scope (lightweight check) ───────────────────────
export async function validateToken(token) {
  const res = await fetch(`${API_BASE}/user`, { headers: apiHeaders(token) })
  if (!res.ok) throw new Error('Invalid GitHub token.')
  const scopes = res.headers.get('x-oauth-scopes') || ''
  if (!scopes.split(',').map(s => s.trim()).includes('gist')) {
    throw new Error('Token is missing the "gist" scope. Create a new token with gist access.')
  }
  const user = await res.json()
  return user.login   // returns GitHub username on success
}
