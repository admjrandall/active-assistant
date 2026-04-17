import React, { useEffect, useState } from 'react'
import zxcvbn from 'zxcvbn'
import { PASSWORD_REQUIREMENTS } from '../../config.js'

export const PasswordStrength = ({ password, onStrengthChange }) => {
  const [strength, setStrength] = useState(null)
  const [checks, setChecks] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    numbers: false,
    specialChars: false,
  })

  useEffect(() => {
    if (!password) {
      setStrength(null)
      onStrengthChange?.(null)
      return
    }

    // Run zxcvbn analysis
    const result = zxcvbn(password)
    setStrength(result)
    onStrengthChange?.(result)

    // Check requirements
    setChecks({
      length: password.length >= PASSWORD_REQUIREMENTS.minLength,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /[0-9]/.test(password),
      specialChars: /[^A-Za-z0-9]/.test(password),
    })
  }, [password, onStrengthChange])

  if (!password) return null

  const scoreColors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-500', 'bg-emerald-500']
  const scoreLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong']
  const scoreColor = strength ? scoreColors[strength.score] : 'bg-slate-200'
  const scoreLabel = strength ? scoreLabels[strength.score] : ''

  const allChecksPassed = Object.values(checks).every(Boolean)

  return (
    <div className="space-y-3">
      {/* Strength Bar */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-600 font-medium">Password Strength</span>
          <span className={`font-semibold ${strength?.score >= 3 ? 'text-emerald-600' : 'text-slate-500'}`}>
            {scoreLabel}
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${scoreColor}`}
            style={{ width: `${((strength?.score ?? 0) + 1) * 20}%` }}
          />
        </div>
      </div>

      {/* Requirements Checklist */}
      <div className="space-y-1.5 text-xs">
        <CheckItem passed={checks.length}>
          At least {PASSWORD_REQUIREMENTS.minLength} characters
        </CheckItem>
        <CheckItem passed={checks.uppercase}>
          Contains uppercase letters (A-Z)
        </CheckItem>
        <CheckItem passed={checks.lowercase}>
          Contains lowercase letters (a-z)
        </CheckItem>
        <CheckItem passed={checks.numbers}>
          Contains numbers (0-9)
        </CheckItem>
        <CheckItem passed={checks.specialChars}>
          Contains special characters (!@#$%^&*)
        </CheckItem>
      </div>

      {/* Feedback */}
      {strength?.feedback?.warning && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
          <span className="font-semibold">Warning:</span> {strength.feedback.warning}
        </p>
      )}

      {/* Crack Time Estimate */}
      {strength && strength.score >= 3 && (
        <p className="text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
          ✓ Estimated crack time: <span className="font-semibold">{strength.crack_times_display.offline_slow_hashing_1e4_per_second}</span>
        </p>
      )}
    </div>
  )
}

const CheckItem = ({ passed, children }) => (
  <div className="flex items-center gap-2">
    <div className={`w-4 h-4 rounded-full flex items-center justify-center ${passed ? 'bg-emerald-500' : 'bg-slate-200'}`}>
      {passed && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
    </div>
    <span className={passed ? 'text-slate-700' : 'text-slate-400'}>{children}</span>
  </div>
)
