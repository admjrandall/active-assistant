// ============================================================================
// VAULT UNLOCK — shown on every app load before any data is visible.
//
// Two storage modes:
//   'file' — Local File: encrypt → browser download. No accounts, works offline.
//   'gist' — GitHub Gist: encrypt → private Gist via PAT. Auto-syncs across devices.
//
// The password is NEVER stored anywhere.
// The PAT (Gist mode) lives in sessionStorage only — cleared on tab close.
// The chosen mode and Gist ID live in localStorage (not sensitive).
// ============================================================================
import { useState, useRef } from 'react'
import { encryptVault, decryptVault } from '../vault/crypto.js'
import { fetchVault, saveVault, createVaultGist, validateToken } from '../vault/gist.js'
import { VaultDB } from '../vault/VaultDB.js'

const GIST_ID_KEY = 'aa-vault-gist-id'
const TOKEN_KEY   = 'aa-vault-pat'   // sessionStorage — cleared on tab close
const MODE_KEY    = 'aa-vault-mode'  // localStorage: 'file' | 'gist'

// ── Reusable Field ─────────────────────────────────────────────────────────────
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

// ── Error banner ───────────────────────────────────────────────────────────────
const ErrorBanner = ({ message }) => (
  <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex gap-2">
    <span className="flex-shrink-0">✕</span>
    <span>{message}</span>
  </div>
)

// ── Spinner ────────────────────────────────────────────────────────────────────
const Spinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
  </svg>
)

// ── Primary button ─────────────────────────────────────────────────────────────
const PrimaryBtn = ({ loading, loadingText, children, ...props }) => (
  <button
    {...props}
    disabled={props.disabled || loading}
    className="flex-1 py-3 bg-indigo-600 text-white font-semibold rounded-xl
               hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
               transition-colors shadow-md shadow-indigo-200 flex items-center justify-center gap-2"
  >
    {loading ? <><Spinner />{loadingText}</> : children}
  </button>
)

// ── Back button ────────────────────────────────────────────────────────────────
const BackBtn = ({ onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium
               text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
  >
    ← Back
  </button>
)

// ── Choice card button ─────────────────────────────────────────────────────────
const ChoiceCard = ({ emoji, title, description, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200
               hover:border-indigo-400 hover:bg-indigo-50/50 text-left transition-all w-full"
  >
    <div className="mt-0.5 w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center
                    flex-shrink-0 text-lg">
      {emoji}
    </div>
    <div>
      <div className="font-semibold text-sm text-slate-800">{title}</div>
      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
    </div>
  </button>
)

// ── Step: Mode selector ────────────────────────────────────────────────────────
const ModeSelector = ({ onSelect }) => (
  <div className="flex flex-col gap-5">
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-900">Choose your vault type</h2>
      <p className="text-sm text-slate-500">
        Your data lives encrypted in memory only — choose where the encrypted vault file is stored between sessions.
      </p>
    </div>
    <ChoiceCard
      emoji="📁"
      title="Local File"
      description="Save the encrypted vault as a .dat file on your device. No accounts needed — works completely offline. You download a new file each time you save."
      onClick={() => onSelect('file')}
    />
    <ChoiceCard
      emoji="☁️"
      title="GitHub Gist (cloud sync)"
      description="Auto-sync the encrypted vault to a private GitHub Gist. Requires a classic GitHub Personal Access Token with gist scope. Syncs across any device."
      onClick={() => onSelect('gist')}
    />
  </div>
)

// ── Step: File sub-mode (new vs open) ──────────────────────────────────────────
const FileSubModeStep = ({ onSelect, onBack }) => (
  <div className="flex flex-col gap-5">
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-900">Local File vault</h2>
      <p className="text-sm text-slate-500">Starting fresh or loading an existing vault file?</p>
    </div>
    <ChoiceCard
      emoji="✨"
      title="Create new vault"
      description="Start with an empty vault. You'll download the encrypted .dat file after your first save."
      onClick={() => onSelect('new')}
    />
    <ChoiceCard
      emoji="📂"
      title="Open existing vault file"
      description="Pick your active-assistant-vault.dat file to decrypt and continue where you left off."
      onClick={() => onSelect('open')}
    />
    <BackBtn onClick={onBack} />
  </div>
)

// ── Step: File picker ──────────────────────────────────────────────────────────
const FilePickerStep = ({ onFilePicked, onBack, error }) => {
  const inputRef = useRef(null)

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => onFilePicked(evt.target.result)
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900">Open vault file</h2>
        <p className="text-sm text-slate-500">
          Select your <code className="bg-slate-100 px-1 rounded text-xs">active-assistant-vault.dat</code> file.
          It is decrypted locally — nothing is uploaded anywhere.
        </p>
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-8 rounded-xl border-2 border-dashed border-slate-300
                   hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-500
                   hover:text-indigo-600 transition-all flex flex-col items-center gap-2"
      >
        <span className="text-3xl">📂</span>
        <span className="text-sm font-medium">Click to select vault file</span>
        <span className="text-xs text-slate-400">active-assistant-vault.dat</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".dat,.json,text/plain,application/octet-stream"
        onChange={handleFile}
        className="hidden"
      />
      {error && <ErrorBanner message={error} />}
      <BackBtn onClick={onBack} />
    </div>
  )
}

// ── Step: Gist credentials ─────────────────────────────────────────────────────
const GistCredentialsStep = ({ token, setToken, gistId, setGistId, onNext, onBack, loading, error }) => (
  <div className="flex flex-col gap-5">
    <div className="space-y-1">
      <h2 className="text-xl font-bold text-slate-900">GitHub Gist vault</h2>
      <p className="text-sm text-slate-500">
        Your data lives encrypted in a private Gist — decrypted into memory only for this session.
      </p>
    </div>
    <Field
      label="GitHub Personal Access Token (classic)"
      hint='github.com → Settings → Developer settings → Personal access tokens → Tokens (classic). Required scope: "gist".'
      type="password"
      autoComplete="off"
      placeholder="ghp_..."
      value={token}
      onChange={e => setToken(e.target.value)}
    />
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Vault Gist ID</label>
      <p className="text-xs text-slate-400 -mt-1">
        Leave blank to create a new private Gist automatically. Paste an existing Gist ID to open it.
      </p>
      <input
        type="text"
        autoComplete="off"
        placeholder="Leave blank for new vault, or paste existing Gist ID"
        value={gistId}
        onChange={e => setGistId(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800
                   focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100
                   placeholder:text-slate-300 font-mono"
      />
    </div>
    {error && <ErrorBanner message={error} />}
    <div className="flex gap-3">
      <BackBtn onClick={onBack} disabled={loading} />
      <PrimaryBtn loading={loading} loadingText="Validating…" onClick={onNext} disabled={!token.trim()}>
        Continue →
      </PrimaryBtn>
    </div>
    <p className="text-[11px] text-slate-400 text-center leading-relaxed">
      Your PAT is stored in <strong>sessionStorage only</strong> — cleared when you close this tab.
    </p>
  </div>
)

// ── Step: Password (shared between file and gist modes) ────────────────────────
const PasswordStep = ({
  isNew, password, setPassword, confirmPassword, setConfirmPassword,
  onSubmit, onBack, loading, error,
}) => (
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
          <strong>There is no password reset.</strong> AES-256-GCM is mathematically unbreakable
          without the key. Write your password down somewhere safe and separate from this device.
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
      <BackBtn onClick={onBack} disabled={loading} />
      <PrimaryBtn
        loading={loading}
        loadingText={isNew ? 'Creating vault…' : 'Decrypting…'}
        onClick={onSubmit}
        disabled={!password}
      >
        {isNew ? 'Create vault & enter' : 'Unlock vault'}
      </PrimaryBtn>
    </div>
  </div>
)

// ── Main component ─────────────────────────────────────────────────────────────
export const VaultUnlock = ({ onUnlocked }) => {
  // Determine initial step based on previously chosen mode
  const savedMode = localStorage.getItem(MODE_KEY)

  // step: 'mode-select' | 'file-submode' | 'file-pick' | 'gist-creds' | 'password'
  const [step,            setStep]            = useState(() => {
    if (savedMode === 'file') return 'file-submode'
    if (savedMode === 'gist') return 'gist-creds'
    return 'mode-select'
  })
  const [vaultMode,       setVaultMode]       = useState(savedMode || '')  // 'file' | 'gist'
  const [fileSubMode,     setFileSubMode]     = useState('')               // 'new' | 'open'
  const [fileContent,     setFileContent]     = useState(null)             // raw string from file picker
  const [token,           setToken]           = useState(sessionStorage.getItem(TOKEN_KEY) || '')
  const [gistId,          setGistId]          = useState(localStorage.getItem(GIST_ID_KEY) || '')
  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')

  const clearPwFields = () => { setPassword(''); setConfirmPassword('') }

  // Is this a brand-new vault (no file to decrypt, no gist to fetch)?
  const isNew = (vaultMode === 'file' && fileSubMode === 'new') ||
                (vaultMode === 'gist' && !gistId.trim())

  // ── Mode selected ────────────────────────────────────────────────────────────
  const handleModeSelect = (mode) => {
    setVaultMode(mode)
    localStorage.setItem(MODE_KEY, mode)
    setError('')
    setStep(mode === 'file' ? 'file-submode' : 'gist-creds')
  }

  // ── File sub-mode chosen ─────────────────────────────────────────────────────
  const handleFileSubMode = (sub) => {
    setFileSubMode(sub)
    setError('')
    clearPwFields()
    setStep(sub === 'open' ? 'file-pick' : 'password')
  }

  // ── File picked from disk ────────────────────────────────────────────────────
  const handleFilePicked = (content) => {
    setFileContent(content)
    clearPwFields()
    setError('')
    setStep('password')
  }

  // ── Gist credentials: validate token then move to password ──────────────────
  const handleGistNext = async () => {
    setError('')
    if (!token.trim()) { setError('A GitHub Personal Access Token is required.'); return }
    setLoading(true)
    try {
      await validateToken(token.trim())
      sessionStorage.setItem(TOKEN_KEY, token.trim())
      clearPwFields()
      setStep('password')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Unlock / create vault ────────────────────────────────────────────────────
  const handleUnlock = async () => {
    setError('')
    if (!password) { setError('Password is required.'); return }

    if (isNew) {
      if (password.length < 8)          { setError('Password must be at least 8 characters.'); return }
      if (password !== confirmPassword)  { setError('Passwords do not match.'); return }
    }

    setLoading(true)
    try {
      if (vaultMode === 'file') {
        if (isNew) {
          // New file vault — start empty, no download until first save
          const emptySnapshot = VaultDB.getSnapshot()
          VaultDB.loadSnapshot(emptySnapshot)
          onUnlocked({ password, mode: 'file' })
        } else {
          // Open existing file — decrypt it
          const snapshot = await decryptVault(fileContent, password)
          VaultDB.loadSnapshot(snapshot)
          onUnlocked({ password, mode: 'file' })
        }
      } else {
        // Gist mode
        let resolvedGistId = gistId.trim()
        if (isNew) {
          // Create a new private Gist, encrypt empty snapshot, push it
          resolvedGistId      = await createVaultGist(token.trim())
          const emptySnapshot = VaultDB.getSnapshot()
          const encrypted     = await encryptVault(emptySnapshot, password)
          await saveVault(token.trim(), resolvedGistId, encrypted)
          localStorage.setItem(GIST_ID_KEY, resolvedGistId)
          VaultDB.loadSnapshot(emptySnapshot)
        } else {
          // Fetch and decrypt existing Gist vault
          const payload  = await fetchVault(token.trim(), resolvedGistId)
          const snapshot = await decryptVault(payload, password)
          localStorage.setItem(GIST_ID_KEY, resolvedGistId)
          VaultDB.loadSnapshot(snapshot)
        }
        sessionStorage.setItem(TOKEN_KEY, token.trim())
        onUnlocked({ token: token.trim(), gistId: resolvedGistId, password, mode: 'gist' })
      }
    } catch (err) {
      console.error('[VaultUnlock]', err)
      // AES-GCM wrong password throws DOMException 'OperationError'
      const isWrongPw = err instanceof DOMException && err.name === 'OperationError'
      setError(isWrongPw
        ? 'Incorrect password — the vault could not be decrypted.'
        : (err.message || 'An unexpected error occurred.'))
    } finally {
      setLoading(false)
    }
  }

  // ── Back navigation ──────────────────────────────────────────────────────────
  const handleBack = () => {
    setError('')
    if (step === 'password') {
      if (vaultMode === 'file' && fileSubMode === 'open') setStep('file-pick')
      else if (vaultMode === 'file') setStep('file-submode')
      else setStep('gist-creds')
    } else if (step === 'file-pick') {
      setStep('file-submode')
    } else {
      // Back from file-submode or gist-creds → mode selector
      localStorage.removeItem(MODE_KEY)
      setVaultMode('')
      setStep('mode-select')
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
          {step === 'mode-select' && (
            <ModeSelector onSelect={handleModeSelect} />
          )}
          {step === 'file-submode' && (
            <FileSubModeStep onSelect={handleFileSubMode} onBack={handleBack} />
          )}
          {step === 'file-pick' && (
            <FilePickerStep onFilePicked={handleFilePicked} onBack={handleBack} error={error} />
          )}
          {step === 'gist-creds' && (
            <GistCredentialsStep
              token={token}   setToken={setToken}
              gistId={gistId} setGistId={setGistId}
              onNext={handleGistNext}
              onBack={handleBack}
              loading={loading}
              error={error}
            />
          )}
          {step === 'password' && (
            <PasswordStep
              isNew={isNew}
              password={password}               setPassword={setPassword}
              confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
              onSubmit={handleUnlock}
              onBack={handleBack}
              loading={loading}
              error={error}
            />
          )}
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
