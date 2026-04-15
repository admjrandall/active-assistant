// ============================================================================
// AUTH GATE — The entry point for the dual-mode application.
// Handles M365 Setup/Login OR Offline Vault Decryption.
// ============================================================================
import React, { useState, useRef, useEffect } from 'react'
import { encryptVault, decryptVault } from '../vault/crypto.js'
import { VaultDB } from '../vault/VaultDB.js'
import { getMsalApp } from '../db/m365.js'
import { STORAGE_MODE_KEY, M365_SETUP_KEY, getM365Config } from '../config.js'

// ── Shared UI Components ──────────────────────────────────────────────────────
const ErrorBanner = ({ message }) => (
  <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex gap-2">
    <span className="flex-shrink-0 font-bold">✕</span><span>{message}</span>
  </div>
)

const Field = ({ label, ...props }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
    <input {...props} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono" />
  </div>
)

const Btn = ({ primary, loading, children, ...props }) => (
  <button
    {...props} disabled={props.disabled || loading}
    className={`flex-1 py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
      ${primary ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200' 
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
  >
    {loading ? <span className="animate-pulse">Processing...</span> : children}
  </button>
)

const ChoiceCard = ({ icon, title, desc, active, onClick }) => (
  <button onClick={onClick} className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all w-full
    ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}>
    <div className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{icon}</div>
    <div>
      <div className="font-semibold text-sm text-slate-800">{title}</div>
      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
    </div>
  </button>
)

// ── Main Component ────────────────────────────────────────────────────────────
export const AuthGate = ({ onUnlocked }) => {
  const savedMode = localStorage.getItem(STORAGE_MODE_KEY)
  const savedM365 = getM365Config()

  // Routing state
  const [step, setStep] = useState(() => {
    if (savedMode === 'offline') return 'offline-auth'
    if (savedMode === 'm365' && savedM365) return 'm365-auth'
    return 'mode-select'
  })

  // Form states
  const [m365Form, setM365Form] = useState({ tenantId: '', clientId: '', url: 'https://YOUR_ORG.crm.dynamics.com' })
  const [offlineFile, setOfflineFile] = useState(null)
  const [password, setPassword] = useState('')
  const [isNewVault, setIsNewVault] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    if (confirm("Are you sure you want to reset the app configuration? This will clear saved M365 settings and storage mode.")) {
      localStorage.removeItem(STORAGE_MODE_KEY)
      localStorage.removeItem(M365_SETUP_KEY)
      window.location.reload()
    }
  }

  const handleM365SetupSave = () => {
    if (!m365Form.tenantId || !m365Form.clientId || !m365Form.url) {
      setError("All fields are required."); return
    }
    localStorage.setItem(M365_SETUP_KEY, JSON.stringify(m365Form))
    localStorage.setItem(STORAGE_MODE_KEY, 'm365')
    setStep('m365-auth')
  }

  const handleM365Login = async () => {
    setLoading(true); setError('')
    try {
      const app = getMsalApp()
      await app.initialize()
      let account = app.getAllAccounts()[0]
      if (!account) {
        const config = getM365Config()
        const result = await app.loginPopup({ scopes: [`${config.url}/.default`] })
        account = result.account
      }
      onUnlocked({ mode: 'm365', account })
    } catch (err) {
      // Authentication error (details not logged for security)
      setError("Microsoft sign-in failed. Please check your configuration or network.")
    } finally {
      setLoading(false)
    }
  }

  const handleOfflineSubmit = async () => {
    setError(''); setLoading(true)
    try {
      if (isNewVault) {
        if (password.length < 12) throw new Error("Password must be at least 12 characters for adequate security.")
        VaultDB.loadSnapshot(VaultDB.getSnapshot()) // Load empty
        localStorage.setItem(STORAGE_MODE_KEY, 'offline')
        onUnlocked({ mode: 'offline', password })
      } else {
        if (!offlineFile) throw new Error("Please select your .dat vault file.")
        if (!password) throw new Error("Password is required.")
        const snapshot = await decryptVault(offlineFile, password)
        VaultDB.loadSnapshot(snapshot)
        localStorage.setItem(STORAGE_MODE_KEY, 'offline')
        onUnlocked({ mode: 'offline', password })
      }
    } catch (err) {
      const isWrongPw = err instanceof DOMException && err.name === 'OperationError'
      setError(isWrongPw ? "Incorrect password. Data could not be decrypted." : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => setOfflineFile(evt.target.result)
    reader.readAsText(file)
  }

  const handleSyncModeSubmit = async () => {
    setError(''); setLoading(true)
    try {
      if (password.length < 12) {
        throw new Error("Password must be at least 12 characters for adequate security.")
      }

      onUnlocked({ mode: 'sync', password })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Render Views ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-50 p-4 z-[9999]">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg mb-3">AA</div>
          <h1 className="text-xl font-bold text-slate-900">Active Assistant</h1>
          <p className="text-sm text-slate-500 mt-1">Select your working environment</p>
        </div>

        {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

        {/* VIEW 1: Mode Select */}
        {step === 'mode-select' && (
          <div className="flex flex-col gap-4">
            <ChoiceCard
              icon="📁"
              title="Offline Work (Air-gapped)"
              desc="All data remains in local memory. You must provide an encrypted .dat file."
              onClick={() => { localStorage.setItem(STORAGE_MODE_KEY, 'offline'); setStep('offline-auth') }}
            />

            <ChoiceCard
              icon="🔄"
              title="Offline-First Sync (Recommended)"
              desc="Works offline with encrypted local storage. Auto-syncs with M365 when online."
              onClick={() => {
                localStorage.setItem(STORAGE_MODE_KEY, 'sync');
                setStep('sync-auth')
              }}
            />

            <ChoiceCard
              icon="☁️"
              title="Always Online (Microsoft 365)"
              desc="Requires constant internet. Direct connection to Dataverse via Entra ID."
              onClick={() => setStep(savedM365 ? 'm365-auth' : 'm365-setup')}
            />
          </div>
        )}

        {/* VIEW 2: M365 Setup */}
        {step === 'm365-setup' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600 mb-2">Configure your Dataverse connection. This is saved to your browser.</p>
            <Field label="Tenant ID" placeholder="00000000-0000-0000-0000-000000000000" value={m365Form.tenantId} onChange={e => setM365Form({...m365Form, tenantId: e.target.value})} />
            <Field label="Client ID (App Reg)" placeholder="11111111-1111-1111-1111-111111111111" value={m365Form.clientId} onChange={e => setM365Form({...m365Form, clientId: e.target.value})} />
            <Field label="Dataverse URL" value={m365Form.url} onChange={e => setM365Form({...m365Form, url: e.target.value})} />
            <div className="flex gap-3 mt-2">
              <Btn onClick={() => setStep('mode-select')}>Back</Btn>
              <Btn primary onClick={handleM365SetupSave}>Save Config</Btn>
            </div>
          </div>
        )}

        {/* VIEW 3: M365 Auth */}
        {step === 'm365-auth' && (
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-sm text-slate-600">You are configured for Microsoft 365 Dataverse.</p>
            <Btn primary loading={loading} onClick={handleM365Login} className="w-full">
              Sign in with Microsoft
            </Btn>
          </div>
        )}

        {/* VIEW 4: Offline Auth */}
        {step === 'offline-auth' && (
          <div className="flex flex-col gap-5">
            {/* Toggle New vs Existing */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => {setIsNewVault(false); setOfflineFile(null)}} className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${!isNewVault ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Open File</button>
              <button onClick={() => {setIsNewVault(true); setOfflineFile(null)}} className={`flex-1 text-xs py-1.5 rounded-md font-semibold transition-all ${isNewVault ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Start Fresh</button>
            </div>

            {!isNewVault && (
              <button onClick={() => fileInputRef.current?.click()} className={`w-full py-6 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-1 ${offlineFile ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 hover:border-indigo-400 bg-slate-50 text-slate-500'}`}>
                <span className="text-2xl">{offlineFile ? '✅' : '📂'}</span>
                <span className="text-sm font-medium">{offlineFile ? 'Vault file loaded' : 'Click to select .dat file'}</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".dat" onChange={handleFileChange} className="hidden" />

            <Field label={isNewVault ? "Create Password" : "Vault Password"} type="password" placeholder="••••••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleOfflineSubmit()} />

            <div className="flex gap-3">
              <Btn onClick={() => setStep('mode-select')}>Back</Btn>
              <Btn primary loading={loading} onClick={handleOfflineSubmit}>
                {isNewVault ? "Create Vault" : "Decrypt & Open"}
              </Btn>
            </div>
          </div>
        )}

        {/* VIEW 5: Sync Mode Auth */}
        {step === 'sync-auth' && (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-slate-600 mb-2">
              Offline-first mode stores encrypted data locally and syncs automatically with M365 when online.
            </p>

            <Field
              label="Encryption Password"
              type="password"
              placeholder="At least 12 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSyncModeSubmit()}
            />

            <div className="flex gap-3">
              <Btn onClick={() => setStep('mode-select')}>Back</Btn>
              <Btn primary loading={loading} onClick={handleSyncModeSubmit}>
                Enable Sync Mode
              </Btn>
            </div>
          </div>
        )}

      </div>

      <button onClick={handleReset} className="mt-8 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">
        Reset App Configuration
      </button>
    </div>
  )
}