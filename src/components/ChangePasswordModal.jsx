import React, { useEffect, useState } from 'react'
import { PasswordStrength } from './auth/PasswordStrength.jsx'
import { rotateVaultPassword } from '../vault/crypto.js'
import { VaultDB } from '../vault/VaultDB.js'

const INITIAL_STATE = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
  error: '',
  passwordStrength: null,
}

export const ChangePasswordModal = ({ isOpen, onClose, vaultPassword, onPasswordChanged, showToast }) => {
  const [currentPassword, setCurrentPassword] = useState(INITIAL_STATE.currentPassword)
  const [newPassword, setNewPassword] = useState(INITIAL_STATE.newPassword)
  const [confirmPassword, setConfirmPassword] = useState(INITIAL_STATE.confirmPassword)
  const [error, setError] = useState(INITIAL_STATE.error)
  const [passwordStrength, setPasswordStrength] = useState(INITIAL_STATE.passwordStrength)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword(INITIAL_STATE.currentPassword)
      setNewPassword(INITIAL_STATE.newPassword)
      setConfirmPassword(INITIAL_STATE.confirmPassword)
      setError(INITIAL_STATE.error)
      setPasswordStrength(INITIAL_STATE.passwordStrength)
      setLoading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async () => {
    setError('')

    if (!vaultPassword) {
      setError('No active vault session was found.')
      return
    }

    if (currentPassword !== vaultPassword) {
      setError('Current password is incorrect.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (!passwordStrength || passwordStrength.score < 3) {
      setError('Please use a stronger password before continuing.')
      return
    }

    setLoading(true)

    try {
      const snapshot = VaultDB.getSnapshot()
      const rotatedVault = await rotateVaultPassword(snapshot, currentPassword, newPassword)
      onPasswordChanged?.(newPassword, rotatedVault)
      showToast?.('Master password updated. Save the vault to persist the change.')
      onClose?.()
    } catch (err) {
      console.error('[ChangePasswordModal]', err)
      setError('Failed to change password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000010] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-6">
        <div className="mb-5">
          <h2 className="text-xl font-bold text-slate-900">Change Master Password</h2>
          <p className="mt-1 text-sm text-slate-500">
            This only updates future vault saves. Save the vault after changing your password.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Current Password</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">New Password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {newPassword && (
            <PasswordStrength password={newPassword} onStrengthChange={setPasswordStrength} />
          )}

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Confirm New Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleSubmit()
                }
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  )
}
