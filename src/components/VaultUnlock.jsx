// ============================================================================
// VAULT UNLOCK — shown on every app load before any data is visible.
// Handles both first-time vault creation and returning sessions.
// The PAT is stored in sessionStorage only (cleared on tab close).
// The Gist ID is stored in localStorage (not sensitive — just an ID).
// The password is NEVER stored anywhere.
// ============================================================================
import { useState } from 'react'
import { encryptVault, decryptVault } from '../vault/crypto.js'
import { fetchVault, saveVault, createVaultGist, validateToken } from '../vault/gist.js'
import { VaultDB } from '../vault/VaultDB.js'

const GIST_ID_KEY = 'aa-vault-gist-id'
const TOKEN_KEY   = 'aa-vault-pat'       // sessionStorage — cleared on tab close

// ── Small reusable field ─────────────────────────────────────────────────────
const Field = ({ label, hint, ...props }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
    {hint && <p className="text-xs text-slate-400 -mt-1">{hint}</p>}
    <input
      {...props}
      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800
                 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
                 placeholder:text-slate-300 font-mono"
    />
  </div>
)

// ── Step 1 — Credentials ─────────────────────────────────────────────────────
const CredentialsStep = ({ token, setToken, gistId, setGistId, onNext, error }) => (
  <div className="flex flex-col gap-5">
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-900">Connect your vault</h2>
      <p className="text-sm text-slate-500">
        Your data never touches this machine's storage. It lives encrypted in a private GitHub Gist,
        decrypted into memory only for this session.
      </p>
    </div>

    <Field
      label="GitHub Personal Access Token"
      hint='Create at github.com → Settings → Developer settings → Fine-grained tokens. Required scope: "Gists" (read & write).'
      type="password"
      autoComplete="off"
      placeholder="github_pat_..."
      value={token}
      onChange={e => setToken(e.target.value)}
    />

    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Vault Gist ID</label>
      <p className="text-xs text-slate-400 -mt-1">
        Leave blank to create a new vault. Paste an existing Gist ID to open an existing one.
      </p>
      <input
        type="text"
        autoComplete="off"
        placeholder="e.g. a1b2c3d4e5f6... (leave blank for new vault)"
        value={gistId}
        onChange={e => setGistId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800
                   focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
                   placeholder:text-slate-300 font-mono"
      />
    </div>

    {error && <ErrorBanner message={error} />}

    <button
      onClick={onNext}
      disabled={!token.trim()}
      className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-xl
                 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                 transition-colors shadow-md shadow-indigo-200"
    >
      Continue →
    </button>

    <p className="text-[11px] text-slate-400 text-center leading-relaxed">
      Your PAT is stored in <strong>sessionStorage only</strong> — it is cleared when you close this tab.
      Your Gist ID is stored in localStorage (not sensitive).
    </p>
  </div>
)

// ── Step 2 — Password (unlock or create) ─────────────────────────────────────
const PasswordStep = ({ isNew, password, setPassword, confirmPassword, setConfirmPassword,
                        onSubmit, onBack, status, error }) => (
  <div className="flex flex-col gap-5">
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-900">
        {isNew ? 'Create your vault password' : 'Unlock your vault'}
      </h2>
      <p className="text-sm text-slate-500">
        {isNew
          ? 'This password encrypts all your data. It is never stored or transmitted — if you lose it, the vault cannot be recovered.'
          : 'Enter the password you used when you created this vault.'}
      </p>
    </div>

    {isNew && (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex gap-2">
        <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>There is no password reset.</strong> AES-256-GCM is mathematically unbreakable without
          the key. Write your password down and store it somewhere safe and separate from this device.
        </p>
      </div>
    )}

    <Field
      label="Password"
      type="password"
      autoComplete={isNew ? 'new-password' : 'current-password'}
      placeholder={isNew ? 'Minimum 12 characters recommended' : '••••••••••••'}
      value={password}
      onChange={e => setPassword(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && !isNew && onSubmit()}
    />

    {isNew && (
      <Field
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChange={e => setConfirmPassword(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit()}
      />
    )}

    {error && <ErrorBanner message={error} />}

    <div className="flex gap-3">
      <button
        onClick={onBack}
        disabled={status === 'loading'}
        className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium
                   text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
      >
        ← Back
      </button>
      <button
        onClick={onSubmit}
        disabled={!password || status === 'loading'}
        className="flex-1 py-3 bg-indigo-600 text-white font-semibold rounded-xl
                   hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
      >
        {status === 'loading' ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {isNew ? 'Creating vault…' : 'Decrypting…'}
          </>
        ) : (
          isNew ? 'Create vault & enter' : 'Unlock vault'
        )}
      </button>
    </div>
  </div>
)

// ── Error banner ─────────────────────────────────────────────────────────────
const ErrorBanner = ({ message }) => (
  <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex gap-2">
    <span className="flex-shrink-0">✕</span>
    <span>{message}</span>
  </div>
)

// ── Main component ────────────────────────────────────────────────────────────
export const VaultUnlock = ({ onUnlocked }) => {
  const [token,           setToken]           = useState(sessionStorage.getItem(TOKEN_KEY) || '')
  const [gistId,          setGistId]          = useState(localStorage.getItem(GIST_ID_KEY) || '')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isNew,           setIsNew]           = useState(false)
  const [step,            setStep]            = useState('credentials')   // 'credentials' | 'password'
  const [status,          setStatus]          = useState('')              // '' | 'loading' | 'error'
  const [errorMsg,        setErrorMsg]        = useState('')

  // ── Step 1 → Step 2 ────────────────────────────────────────────────────────
  const handleCredentialsNext = async () => {
    setErrorMsg('')
    if (!token.trim()) { setErrorMsg('A GitHub Personal Access Token is required.'); return }
    setStatus('loading')
    try {
      await validateToken(token.trim())
    } catch (err) {
      setErrorMsg(err.message)
      setStatus('error')
      return
    }
    setStatus('')
    setIsNew(!gistId.trim())
    setStep('password')
  }

  // ── Step 2 — decrypt or create ─────────────────────────────────────────────
  const handleUnlock = async () => {
    setErrorMsg('')
    if (!password) { setErrorMsg('Password is required.'); return }

    if (isNew) {
      if (password.length < 8)           { setErrorMsg('Password must be at least 8 characters.'); return }
      if (password !== confirmPassword)  { setErrorMsg('Passwords do not match.'); return }
    }

    setStatus('loading')
    try {
      let resolvedGistId = gistId.trim()

      if (isNew) {
        // ── First-time setup ──────────────────────────────────────────────
        resolvedGistId = await createVaultGist(token.trim())
        const emptySnapshot = VaultDB.getSnapshot()
        const encrypted     = await encryptVault(emptySnapshot, password)
        await saveVault(token.trim(), resolvedGistId, encrypted)

        localStorage.setItem(GIST_ID_KEY, resolvedGistId)
        sessionStorage.setItem(TOKEN_KEY, token.trim())
        VaultDB.loadSnapshot(emptySnapshot)

      } else {
        // ── Returning session ─────────────────────────────────────────────
        const payload  = await fetchVault(token.trim(), resolvedGistId)
        const snapshot = await decryptVault(payload, password)

        localStorage.setItem(GIST_ID_KEY, resolvedGistId)
        sessionStorage.setItem(TOKEN_KEY, token.trim())
        VaultDB.loadSnapshot(snapshot)
      }

      setStatus('')
      onUnlocked({ token: token.trim(), gistId: resolvedGistId, password })

    } catch (err) {
      console.error('[VaultUnlock]', err)
      // AES-GCM wrong password throws a DOMException named OperationError
      const isWrongPw = err instanceof DOMException && err.name === 'OperationError'
      setErrorMsg(isWrongPw
        ? 'Incorrect password — the vault could not be decrypted.'
        : (err.message || 'An unexpected error occurred.'))
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-indigo-50 p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-14 h-14 bg-indigo-600 rounded-2xl items-center justify-center
                          text-white font-extrabold text-xl shadow-xl shadow-indigo-200 mb-4">
            AA
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Active Assistant</h1>
          <p className="text-sm text-slate-500 mt-1">Encrypted · Stateless · Private</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8">
          {step === 'credentials'
            ? <CredentialsStep
                token={token}           setToken={setToken}
                gistId={gistId}         setGistId={setGistId}
                onNext={handleCredentialsNext}
                error={errorMsg}
              />
            : <PasswordStep
                isNew={isNew}
                password={password}               setPassword={setPassword}
                confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
                onSubmit={handleUnlock}
                onBack={() => { setStep('credentials'); setErrorMsg(''); setPassword(''); setConfirmPassword('') }}
                status={status}
                error={errorMsg}
              />
          }
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400 mt-6 leading-relaxed">
          Data is encrypted with AES-256-GCM · Key derived with PBKDF2-SHA-256 (310,000 iterations)<br/>
          Nothing is written to this machine · Session ends when you close the tab
        </p>
      </div>
    </div>
  )
}
