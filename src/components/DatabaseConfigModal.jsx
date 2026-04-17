import React, { useState, useEffect } from 'react'
import {
  ADAPTER_TYPES,
  getAdapterConfig,
  setAdapterConfig,
  listAdapters,
} from '../db/adapterRegistry.js'

const FIELD_DEFS = {
  dataverse: [
    { key: 'clientId', label: 'Azure App Client ID',  type: 'text',     required: true },
    { key: 'tenantId', label: 'Azure Tenant ID',       type: 'text',     required: true },
    { key: 'url',      label: 'Dataverse URL',          type: 'url',      required: true,
      placeholder: 'https://yourorg.crm.dynamics.com' },
  ],
  supabase: [
    { key: 'url',     label: 'Supabase Project URL', type: 'url',      required: true,
      placeholder: 'https://xxxx.supabase.co' },
    { key: 'anonKey', label: 'Anon/Public Key',       type: 'password', required: true },
  ],
  firebase: [
    { key: 'projectId', label: 'Firebase Project ID',           type: 'text',     required: true },
    { key: 'apiKey',    label: 'Firebase Web API Key',           type: 'password', required: true },
    { key: 'idToken',   label: 'Firebase ID Token (optional)',   type: 'password', required: false,
      help: 'Leave blank for public/unauthenticated access' },
  ],
  sharepoint: [
    { key: 'clientId', label: 'Azure App Client ID', type: 'text', required: true },
    { key: 'tenantId', label: 'Azure Tenant ID',     type: 'text', required: true },
    { key: 'siteUrl',  label: 'SharePoint Site URL', type: 'url',  required: true,
      placeholder: 'https://yourtenant.sharepoint.com/sites/yoursite' },
  ],
  'custom-rest': [
    { key: 'baseUrl',    label: 'API Base URL',       type: 'url',      required: true },
    { key: 'authHeader', label: 'Auth Header Value',  type: 'password', required: false,
      placeholder: 'Bearer your-token-here' },
  ],
}

export const DatabaseConfigModal = ({ isOpen, onClose, onSaved }) => {
  const current = getAdapterConfig()
  const [selectedType, setSelectedType] = useState(current.type || 'dataverse')
  const [formValues, setFormValues]     = useState(current.config || {})
  const [testing, setTesting]           = useState(false)
  const [testResult, setTestResult]     = useState(null)
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (isOpen) {
      const c = getAdapterConfig()
      setSelectedType(c.type || 'dataverse')
      setFormValues(c.config || {})
      setTestResult(null)
    }
  }, [isOpen])

  const handleTypeChange = (type) => {
    setSelectedType(type)
    setFormValues({})
    setTestResult(null)
  }

  const handleFieldChange = (key, value) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }

  const buildConfig = () => {
    const config = { ...formValues }
    if (selectedType === 'custom-rest' && formValues.authHeader) {
      config.headers = { 'Authorization': formValues.authHeader }
    }
    return config
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const config = buildConfig()
      const { class: AdapterClass } = ADAPTER_TYPES[selectedType]
      const adapter = new AdapterClass(config)
      const result = await adapter.testConnection()
      setTestResult({ ok: true, message: result.message })
    } catch (err) {
      setTestResult({ ok: false, message: err.message })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      setAdapterConfig(selectedType, buildConfig())
      onSaved?.()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const fields = FIELD_DEFS[selectedType] || []

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Database Connection</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">Database Type</label>
            <div className="grid grid-cols-1 gap-2">
              {listAdapters().map(({ type, label, icon }) => (
                <button
                  key={type}
                  onClick={() => handleTypeChange(type)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    selectedType === type
                      ? 'border-indigo-500 bg-indigo-500/10 text-white'
                      : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span className="font-medium">{label}</span>
                  {type === 'dataverse' && (
                    <span className="ml-auto text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">Default</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {fields.length > 0 && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-300">Connection Settings</label>
              {fields.map(f => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {f.label} {f.required && <span className="text-red-400">*</span>}
                  </label>
                  <input
                    type={f.type || 'text'}
                    value={formValues[f.key] || ''}
                    onChange={e => handleFieldChange(f.key, e.target.value)}
                    placeholder={f.placeholder || ''}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  />
                  {f.help && <p className="text-xs text-slate-500 mt-1">{f.help}</p>}
                </div>
              ))}
            </div>
          )}

          {testResult && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              testResult.ok
                ? 'bg-green-500/10 text-green-300 border border-green-500/20'
                : 'bg-red-500/10 text-red-300 border border-red-500/20'
            }`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-6 border-t border-slate-700">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save & Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
