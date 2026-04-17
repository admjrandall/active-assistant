import React, { useState, useRef, useEffect } from 'react'
import { PasswordStrength } from './PasswordStrength.jsx'
import { getMsalApp } from '../../db/m365.js'
import { M365_SETUP_KEY, getM365Config } from '../../config.js'
import { decryptVault } from '../../vault/crypto.js'
import { VaultDB } from '../../vault/VaultDB.js'
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  enrollPasskey,
  hasEnrolledPasskey,
  verifyPasskey,
} from '../../auth/webauthn.js'

// ── Shared UI Components ────────────────────────────────────────────────────
const ErrorBanner = ({ message }) => (
  <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700 flex gap-2 animate-in fade-in slide-in-from-top-2">
    <span className="flex-shrink-0 font-bold">✕</span><span>{message}</span>
  </div>
)

const Field = ({ label, ...props }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
    <input {...props} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono transition-all" />
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

const ModeCard = ({ icon, title, desc, badge, recommended, onClick }) => (
  <button onClick={onClick} className={`relative flex items-start gap-4 p-5 rounded-2xl border-2 text-left transition-all w-full group hover:scale-[1.02] hover:shadow-lg
    ${recommended ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 to-white' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}>
    {recommended && (
      <div className="absolute -top-3 left-4 px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-md">
        Recommended
      </div>
    )}
    <div className={`mt-0.5 w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl transition-all ${recommended ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-slate-100 group-hover:bg-indigo-100'}`}>{icon}</div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <div className="font-bold text-slate-800">{title}</div>
        {badge && <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{badge}</span>}
      </div>
      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{desc}</p>
    </div>
  </button>
)

const ProgressSteps = ({ currentStep, totalSteps }) => (
  <div className="flex items-center gap-2 mb-8">
    {Array.from({ length: totalSteps }).map((_, i) => (
      <React.Fragment key={i}>
        <div className={`flex-1 h-1.5 rounded-full transition-all ${i < currentStep ? 'bg-indigo-600' : i === currentStep ? 'bg-indigo-400' : 'bg-slate-200'}`} />
      </React.Fragment>
    ))}
  </div>
)

// ── Main Wizard Component ───────────────────────────────────────────────────
export const WizardOnboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0)
  const [selectedMode, setSelectedMode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Offline mode state
  const [password, setPassword] = useState('')
  const [passwordStrength, setPasswordStrength] = useState(null)
  const [isNewVault, setIsNewVault] = useState(true)
  const [offlineFile, setOfflineFile] = useState(null)
  const fileInputRef = useRef(null)

  // Passkey state
  const [canUsePasskey, setCanUsePasskey]     = useState(false)
  const [passkeyStep, setPasskeyStep]         = useState(false)
  const [passkeyEnrolled, setPasskeyEnrolled] = useState(false)

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaSecret, setMfaSecret]     = useState(null)
  const [mfaToken, setMfaToken]       = useState('')
  const [mfaError, setMfaError]       = useState('')
  const [pendingAccount, setPendingAccount] = useState(null)

  // Cloud mode state
  const [m365Form, setM365Form] = useState(() => {
    const saved = getM365Config()
    return saved || { tenantId: '', clientId: '', url: 'https://YOUR_ORG.crm.dynamics.com' }
  })

  useEffect(() => {
    isPlatformAuthenticatorAvailable().then(setCanUsePasskey)
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleModeSelect = (mode) => {
    setSelectedMode(mode)
    setError('')
    setStep(1)
  }

  const handleBack = () => {
    setError('')
    if (step === 1) {
      setSelectedMode(null)
      setStep(0)
    } else {
      setStep(step - 1)
    }
  }

  const handleOfflineSetup = async () => {
    setError('')
    setLoading(true)

    try {
      // Validate password strength
      if (!passwordStrength || passwordStrength.score < 3) {
        throw new Error('Please use a stronger password (Good or Strong rating).')
      }

      if (isNewVault) {
        VaultDB.loadSnapshot(VaultDB.getSnapshot())
        if (canUsePasskey && !hasEnrolledPasskey()) {
          setPasskeyStep(true)
          return
        }
        await onComplete({ mode: 'offline', password })
      } else {
        if (!offlineFile) throw new Error('Please select your .dat vault file.')
        const snapshot = await decryptVault(offlineFile, password)
        VaultDB.loadSnapshot(snapshot)
        await onComplete({ mode: 'offline', password })
      }
    } catch (err) {
      const isWrongPw = err instanceof DOMException && err.name === 'OperationError'
      setError(isWrongPw ? 'Incorrect password. Data could not be decrypted.' : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCloudSetup = async () => {
    setError('')
    setLoading(true)

    try {
      // Validate M365 config
      if (!m365Form.tenantId || !m365Form.clientId || !m365Form.url) {
        throw new Error('All fields are required for M365 configuration.')
      }

      // Save config
      localStorage.setItem(M365_SETUP_KEY, JSON.stringify(m365Form))

      // Attempt M365 login
      const app = getMsalApp()
      await app.initialize()
      let account = app.getAllAccounts()[0]

      if (!account) {
        const result = await app.loginPopup({ scopes: [`${m365Form.url}/.default`] })
        account = result.account
      }

      setPendingAccount(account)
      await onComplete({ mode: 'cloud', account })
    } catch (err) {
      setError(err?.message || 'Microsoft sign-in failed. Please check your configuration.')
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

  // ── Render Steps ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-50 p-4 z-[9999] overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200/60 p-8 my-8 animate-in fade-in slide-in-from-bottom-4">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white font-black text-2xl shadow-xl shadow-indigo-200 mb-4">
            AA
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Active Assistant</h1>
          <p className="text-sm text-slate-500 mt-1">
            {step === 0 && 'Welcome! Let\'s get you started.'}
            {step === 1 && selectedMode === 'offline' && 'Set up your private vault'}
            {step === 1 && selectedMode === 'cloud' && 'Connect to Microsoft 365'}
          </p>
        </div>

        {!passkeyStep && step > 0 && <ProgressSteps currentStep={step} totalSteps={2} />}

        {error && <div className="mb-6"><ErrorBanner message={error} /></div>}

        {/* STEP 0: Mode Selection */}
        {step === 0 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Choose your workflow</h2>

            <ModeCard
              icon="🔒"
              title="Offline Mode"
              desc="Maximum privacy. All data stays in your device's memory, encrypted with AES-256. Perfect for air-gapped environments, confidential work, or personal projects."
              badge="Air-Gapped"
              onClick={() => handleModeSelect('offline')}
            />

            <ModeCard
              icon="☁️"
              title="Cloud Mode"
              desc="Full team collaboration with Microsoft 365 integration. Real-time sync, user accounts, role-based permissions, and audit logging. Queues changes when offline."
              badge="Best for Teams"
              recommended
              onClick={() => handleModeSelect('cloud')}
            />

            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold">Note:</span> You can switch between modes anytime. Offline mode works completely without internet. Cloud mode requires Microsoft 365 Dataverse.
              </p>
            </div>
          </div>
        )}

        {/* STEP 1: Offline Setup */}
        {step === 1 && selectedMode === 'offline' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-lg font-bold text-slate-800">
              {isNewVault ? 'Create Your Vault' : 'Open Existing Vault'}
            </h2>

            {/* Toggle New vs Existing */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => { setIsNewVault(true); setOfflineFile(null); setPassword(''); setError(''); }}
                className={`flex-1 text-sm py-2 rounded-md font-semibold transition-all ${isNewVault ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Start Fresh
              </button>
              <button
                onClick={() => { setIsNewVault(false); setOfflineFile(null); setPassword(''); setError(''); }}
                className={`flex-1 text-sm py-2 rounded-md font-semibold transition-all ${!isNewVault ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Open File
              </button>
            </div>

            {/* File Upload (Existing Vault) */}
            {!isNewVault && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-8 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-2 ${offlineFile ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-300 hover:border-indigo-400 bg-slate-50 text-slate-500'}`}
                >
                  <span className="text-4xl">{offlineFile ? '✅' : '📂'}</span>
                  <span className="text-sm font-medium">{offlineFile ? 'Vault file loaded' : 'Click to select .dat file'}</span>
                </button>
                <input ref={fileInputRef} type="file" accept=".dat" onChange={handleFileChange} className="hidden" />
              </>
            )}

            {/* Password Field */}
            <Field
              label={isNewVault ? "Create Master Password" : "Master Password"}
              type="password"
              placeholder="Enter a strong password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />

            {/* Password Strength (New Vault Only) */}
            {isNewVault && password && (
              <PasswordStrength password={password} onStrengthChange={setPasswordStrength} />
            )}

            {/* Info Box */}
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <p className="text-xs text-indigo-900 leading-relaxed">
                <span className="font-semibold">🔐 Security:</span> Your vault is encrypted with AES-256-GCM using PBKDF2 (310,000 iterations). Your password is never stored—only you know it. Lose it, and your data is unrecoverable.
              </p>
            </div>

            {/* Passkey unlock (existing vault only) */}
            {!isNewVault && hasEnrolledPasskey() && isWebAuthnSupported() && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400">or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <Btn
                  loading={loading}
                  onClick={async () => {
                    setLoading(true)
                    setError('')
                    try {
                      await verifyPasskey()
                      await onComplete({ mode: 'offline', password })
                    } catch (err) {
                      setError(`Passkey failed: ${err.message}. Use your password instead.`)
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  🔑 Use Passkey
                </Btn>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Btn onClick={handleBack}>Back</Btn>
              <Btn
                primary
                loading={loading}
                onClick={handleOfflineSetup}
                disabled={!password || (isNewVault && (!passwordStrength || passwordStrength.score < 3)) || (!isNewVault && !offlineFile)}
              >
                {isNewVault ? 'Create Vault' : 'Unlock Vault'}
              </Btn>
            </div>
          </div>
        )}

        {/* PASSKEY ENROLLMENT STEP (after new vault creation) */}
        {passkeyStep && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <ProgressSteps currentStep={2} totalSteps={3} />
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mx-auto mb-4 text-3xl">🔑</div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Set Up Passkey?</h2>
              <p className="text-sm text-slate-500">Use your fingerprint or face to unlock next time — no password needed.</p>
            </div>

            {passkeyEnrolled ? (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 text-center">
                ✓ Passkey enrolled! You can now unlock with biometrics.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Btn
                  primary
                  loading={loading}
                  onClick={async () => {
                    setLoading(true)
                    setError('')
                    try {
                      await enrollPasskey('Active Assistant User')
                      setPasskeyEnrolled(true)
                    } catch (err) {
                      setError(err.message)
                    } finally {
                      setLoading(false)
                    }
                  }}
                >
                  Enable Passkey (Touch ID / Face ID)
                </Btn>
                <Btn onClick={() => onComplete({ mode: 'offline', password })}>
                  Skip for Now
                </Btn>
              </div>
            )}

            {error && <div className="mb-2"><ErrorBanner message={error} /></div>}

            {passkeyEnrolled && (
              <Btn primary onClick={() => onComplete({ mode: 'offline', password })}>
                Continue →
              </Btn>
            )}
          </div>
        )}

        {/* STEP 1: Cloud Setup */}
        {step === 1 && selectedMode === 'cloud' && (
          <div className="space-y-5 animate-in fade-in slide-in-from-right-4">
            <h2 className="text-lg font-bold text-slate-800">Connect to Microsoft 365</h2>

            <p className="text-sm text-slate-600">
              Active Assistant uses Microsoft Dataverse to store your data securely in the cloud. You'll need an Azure App Registration to continue.
            </p>

            <Field
              label="Tenant ID"
              placeholder="00000000-0000-0000-0000-000000000000"
              value={m365Form.tenantId}
              onChange={e => setM365Form({ ...m365Form, tenantId: e.target.value })}
            />

            <Field
              label="Client ID (App Registration)"
              placeholder="11111111-1111-1111-1111-111111111111"
              value={m365Form.clientId}
              onChange={e => setM365Form({ ...m365Form, clientId: e.target.value })}
            />

            <Field
              label="Dataverse URL"
              placeholder="https://YOUR_ORG.crm.dynamics.com"
              value={m365Form.url}
              onChange={e => setM365Form({ ...m365Form, url: e.target.value })}
            />

            {/* Info Box */}
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs text-blue-900 leading-relaxed">
                <span className="font-semibold">ℹ️ Need help?</span> These settings are saved locally in your browser. You can find your Tenant ID and Client ID in the Azure Portal under "App Registrations".
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Btn onClick={handleBack}>Back</Btn>
              <Btn
                primary
                loading={loading}
                onClick={handleCloudSetup}
                disabled={!m365Form.tenantId || !m365Form.clientId || !m365Form.url}
              >
                Sign in with Microsoft
              </Btn>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="mt-6 text-center">
        <p className="text-xs text-slate-400">
          Powered by React • Vite • Tailwind CSS • WebLLM
        </p>
      </div>
    </div>
  )
}
