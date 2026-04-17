import React, { useState, useEffect } from 'react'
import { generateTOTPSecret, generateOTPAuthURI, verifyTOTP, renderQRCodeURI } from '../../auth/totp.js'

export const MFASetup = ({ userEmail, onComplete, onSkip }) => {
  const [secret, setSecret]     = useState('')
  const [qrUri, setQrUri]       = useState('')
  const [token, setToken]       = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [step, setStep]         = useState('setup') // 'setup' | 'verify' | 'done'

  useEffect(() => {
    const s = generateTOTPSecret()
    setSecret(s)
    setQrUri(renderQRCodeURI(generateOTPAuthURI(s, userEmail)))
  }, [userEmail])

  const handleVerify = async () => {
    setLoading(true)
    setError('')
    try {
      const ok = await verifyTOTP(secret, token)
      if (!ok) {
        setError('Incorrect code. Check your authenticator app and try again.')
        return
      }
      setStep('done')
      onComplete?.({ secret, enabled: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {step === 'setup' && (
        <>
          <div className="text-center">
            <div className="text-3xl mb-3">🔐</div>
            <h3 className="font-bold text-slate-800 text-lg">Set Up Two-Factor Auth</h3>
            <p className="text-sm text-slate-500 mt-1">
              Scan the QR code with Google Authenticator, Authy, or any TOTP app.
            </p>
          </div>

          <div className="flex justify-center">
            <img
              src={qrUri}
              alt="QR Code"
              className="w-48 h-48 rounded-xl border border-slate-200"
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2">Or enter manually:</p>
            <code className="text-sm font-mono text-slate-800 break-all select-all">{secret}</code>
          </div>

          <button
            onClick={() => setStep('verify')}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
          >
            I've Scanned the Code →
          </button>
          <button
            onClick={onSkip}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip for now
          </button>
        </>
      )}

      {step === 'verify' && (
        <>
          <div className="text-center">
            <h3 className="font-bold text-slate-800 text-lg">Enter Verification Code</h3>
            <p className="text-sm text-slate-500 mt-1">Open your authenticator app and enter the 6-digit code.</p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={token}
            onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            className="w-full text-center text-2xl font-mono tracking-widest px-4 py-4 rounded-xl border border-slate-200 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
            autoFocus
          />

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
          )}

          <button
            onClick={handleVerify}
            disabled={token.length !== 6 || loading}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify & Enable 2FA'}
          </button>
          <button onClick={() => setStep('setup')} className="text-sm text-slate-400 hover:text-slate-600 text-center w-full">
            ← Back
          </button>
        </>
      )}

      {step === 'done' && (
        <div className="text-center py-4">
          <div className="text-5xl mb-4">✅</div>
          <h3 className="font-bold text-slate-800 text-lg">2FA Enabled!</h3>
          <p className="text-sm text-slate-500 mt-2">Your account is now protected with two-factor authentication.</p>
        </div>
      )}
    </div>
  )
}
