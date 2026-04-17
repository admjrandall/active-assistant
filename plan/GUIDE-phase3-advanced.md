# GUIDE: Phase 3 — Advanced Features + PWA

> **Goal:** Service Worker + PWA manifest, GitHub Gist cloud backup for offline vaults,
> time tracking UI, Gantt chart, and completing the offline-first architecture.
>
> **What's already complete (do not redo):**
> - ✅ VaultDB.js + crypto.js — offline encryption + in-memory DB
> - ✅ File System API save/download in App.jsx (lines 113-162)
> - ✅ vault/gist.js — GitHub Gist read/write/create/validate — COMPLETE but not wired
>
> **What this guide covers:**
> 1. PWA manifest + Service Worker (if GUIDE-cloud-offline-sync.md not yet done, do those steps first)
> 2. GitHub Gist backup integration — wire gist.js into the Environment Hub
> 3. Time tracking UI (TimeTracker component + timeEntries collection)
> 4. Gantt chart (lightweight SVG-based)
> 5. Task dependencies UI (blockedBy/blocks fields already in schema)
>
> **Prerequisites:**
> - `npm run dev` works in both modes
> - GUIDE-cloud-offline-sync.md done (or skip Step 1 if not using PWA yet)

---

## Part 1: PWA Setup

> **If you already followed GUIDE-cloud-offline-sync.md**, Steps 1.1-1.3 are already done.
> Skip to Part 2.

### Step 1.1: Create public/manifest.json

See GUIDE-cloud-offline-sync.md Step 4 for the full manifest.json content.
Summary: create `public/manifest.json` with app name, icons, `display: "standalone"`.

### Step 1.2: Register Service Worker in main.jsx

See GUIDE-cloud-offline-sync.md Step 5. Add SW registration at bottom of `src/main.jsx`.

### Step 1.3: Update vite.config.js

See GUIDE-cloud-offline-sync.md Step 6. Ensure `sw.js` is excluded from single-file inlining.

### Step 1.4: Add manifest link to index.html

Vite normally injects this, but verify `index.html` has:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#6366f1" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

---

## Part 2: GitHub Gist Backup Integration

`src/vault/gist.js` is complete — it has `fetchVault`, `saveVault`, `createVaultGist`,
and `validateToken`. It just needs a UI and wiring in App.jsx.

This feature is for **offline mode only** — it lets users back up their encrypted vault
to a private GitHub Gist for cloud redundancy without surrendering their encryption key.

---

### Step 2.1: Add Gist Config Keys to config.js

In **`src/config.js`**, add:

```javascript
export const GIST_CONFIG_KEY = 'aa-gist-config'  // { token, gistId, username }

export const getGistConfig = () => {
  const stored = localStorage.getItem(GIST_CONFIG_KEY)
  if (!stored) return null
  try { return JSON.parse(stored) } catch { return null }
}

export const setGistConfig = (config) => {
  if (config) localStorage.setItem(GIST_CONFIG_KEY, JSON.stringify(config))
  else localStorage.removeItem(GIST_CONFIG_KEY)
}
```

---

### Step 2.2: Create GistConfigModal Component

Create **`src/components/GistConfigModal.jsx`**:

```jsx
import React, { useState, useEffect } from 'react'
import { getGistConfig, setGistConfig } from '../config.js'
import { validateToken, createVaultGist } from '../vault/gist.js'

export const GistConfigModal = ({ isOpen, onClose, onConfigured }) => {
  const [token, setToken]       = useState('')
  const [gistId, setGistId]     = useState('')
  const [step, setStep]         = useState('config') // 'config' | 'validating' | 'done'
  const [error, setError]       = useState('')
  const [username, setUsername] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const cfg = getGistConfig()
      if (cfg) {
        setToken(cfg.token || '')
        setGistId(cfg.gistId || '')
        setUsername(cfg.username || '')
      }
      setError('')
    }
  }, [isOpen])

  const handleValidate = async () => {
    setStep('validating')
    setError('')
    try {
      const login = await validateToken(token)
      setUsername(login)
      setStep('config')
    } catch (err) {
      setError(err.message)
      setStep('config')
    }
  }

  const handleCreateGist = async () => {
    setCreating(true)
    setError('')
    try {
      const id = await createVaultGist(token)
      setGistId(id)
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleSave = () => {
    if (!token || !gistId) {
      setError('Both a token and Gist ID are required.')
      return
    }
    setGistConfig({ token, gistId, username })
    onConfigured?.({ token, gistId, username })
    onClose()
  }

  const handleDisable = () => {
    setGistConfig(null)
    setToken('')
    setGistId('')
    setUsername('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-slate-900">GitHub Gist Backup</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sync your encrypted vault to a private Gist</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Instructions */}
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-2">
            <p className="font-medium text-slate-800">Setup instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Go to <strong>github.com → Settings → Developer settings → Personal access tokens</strong></li>
              <li>Create a token with <strong>gist</strong> scope only</li>
              <li>Paste it below and click "Validate Token"</li>
              <li>Either paste an existing Gist ID or click "Create New Gist"</li>
            </ol>
          </div>

          {/* Token */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              GitHub Personal Access Token
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleValidate}
                disabled={!token || step === 'validating'}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {step === 'validating' ? '...' : 'Validate'}
              </button>
            </div>
            {username && (
              <p className="text-xs text-green-600 mt-1">✓ Authenticated as @{username}</p>
            )}
          </div>

          {/* Gist ID */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Gist ID
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={gistId}
                onChange={e => setGistId(e.target.value)}
                placeholder="Paste existing Gist ID..."
                className="flex-1 px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCreateGist}
                disabled={!token || creating}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {creating ? '...' : 'Create New'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200">
          {getGistConfig() && (
            <button
              onClick={handleDisable}
              className="text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              Disable Gist Backup
            </button>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 text-slate-500 text-sm hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!token || !gistId}
            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
```

---

### Step 2.3: Wire Gist Backup into App.jsx

In **`src/App.jsx`**:

#### Imports:
```javascript
import { GistConfigModal } from './components/GistConfigModal.jsx'
import { getGistConfig } from './config.js'
import { saveVault, fetchVault } from './vault/gist.js'
import { encryptVault, decryptVault } from './vault/crypto.js'
```

#### State:
```javascript
const [isGistConfigOpen, setIsGistConfigOpen] = useState(false)
const [isGistSyncing, setIsGistSyncing]       = useState(false)
```

#### Gist save handler (add near handleSaveVault):
```javascript
const handleSaveToGist = useCallback(async () => {
  const gistCfg = getGistConfig()
  if (!gistCfg) {
    setIsGistConfigOpen(true)
    return
  }

  if (!vaultCtxRef.current?.password) {
    showToast('Cannot save to Gist: vault is not unlocked')
    return
  }

  setIsGistSyncing(true)
  try {
    const snapshot = VaultDB.getSnapshot()
    const encrypted = await encryptVault(snapshot, vaultCtxRef.current.password)
    await saveVault(gistCfg.token, gistCfg.gistId, encrypted)
    showToast('Vault saved to GitHub Gist')
  } catch (err) {
    showToast(`Gist save failed: ${err.message}`)
  } finally {
    setIsGistSyncing(false)
  }
}, [vaultCtxRef, showToast])
```

#### Gist restore handler:
```javascript
const handleLoadFromGist = useCallback(async (token, gistId, password) => {
  try {
    const encrypted = await fetchVault(token, gistId)
    const snapshot  = await decryptVault(encrypted, password)
    VaultDB.loadSnapshot(snapshot)
    await loadAllData()
    showToast('Vault loaded from GitHub Gist')
  } catch (err) {
    showToast(`Gist load failed: ${err.message}`)
  }
}, [loadAllData, showToast])
```

#### JSX (add modal + menu buttons):
```jsx
{/* Gist Config Modal */}
<GistConfigModal
  isOpen={isGistConfigOpen}
  onClose={() => setIsGistConfigOpen(false)}
  onConfigured={() => showToast('Gist backup configured')}
/>
```

In the **Environment Hub menu** (offline mode only):
```jsx
{storageMode === 'offline' && (
  <>
    <button
      onClick={() => { setIsEnvMenuOpen(false); handleSaveToGist() }}
      disabled={isGistSyncing}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
    >
      {isGistSyncing ? '⏳ Saving to Gist...' : '☁️ Save to GitHub Gist'}
    </button>
    <button
      onClick={() => { setIsEnvMenuOpen(false); setIsGistConfigOpen(true) }}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
    >
      ⚙️ Configure Gist Backup
    </button>
  </>
)}
```

---

## Part 3: Time Tracking UI

The `timeEntries` schema and collection already exist. This part adds the UI.

---

### Step 3.1: Create TimeTracker Component

Create **`src/components/advanced/TimeTracker.jsx`**:

```jsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useCRM } from '../../context.jsx'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { formatDistance } from 'date-fns'

// Format seconds as HH:MM:SS
const formatDuration = (seconds) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

export const TimeTracker = ({ projectId, taskId, onEntryAdded }) => {
  const { DB } = useCRM()
  const currentUser = useCurrentUser()
  const [entries, setEntries]     = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [elapsed, setElapsed]     = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [notes, setNotes]         = useState('')
  const [billable, setBillable]   = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    loadEntries()
    return () => clearInterval(timerRef.current)
  }, [projectId, taskId])

  const loadEntries = async () => {
    if (!DB) return
    const all = await DB.getAll('timeEntries')
    const filtered = all.filter(e =>
      (projectId && e.projectId === projectId) ||
      (taskId    && e.taskId    === taskId)
    )
    setEntries(filtered.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)))
  }

  const handleStart = () => {
    const now = new Date()
    setStartTime(now)
    setIsRunning(true)
    setElapsed(0)
    timerRef.current = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
  }

  const handleStop = useCallback(async () => {
    clearInterval(timerRef.current)
    setIsRunning(false)

    if (!startTime || elapsed < 5) {
      setElapsed(0)
      setStartTime(null)
      return // Ignore < 5 second sessions
    }

    const entry = {
      id: `te-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId:    currentUser?.id || currentUser?.email || 'offline-user',
      projectId: projectId || null,
      taskId:    taskId    || null,
      startTime: startTime.toISOString(),
      endTime:   new Date().toISOString(),
      duration:  elapsed,
      billable,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    }

    await DB.put('timeEntries', entry)
    setElapsed(0)
    setStartTime(null)
    setNotes('')
    await loadEntries()
    onEntryAdded?.(entry)
  }, [startTime, elapsed, billable, notes, currentUser, projectId, taskId, DB])

  const handleDeleteEntry = async (id) => {
    await DB.delete('timeEntries', id)
    loadEntries()
  }

  const totalSeconds = entries.reduce((sum, e) => sum + (e.duration || 0), 0)
  const billableSeconds = entries.filter(e => e.billable).reduce((sum, e) => sum + (e.duration || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Timer controls */}
      <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-3">
        {/* Clock display */}
        <div className="text-center">
          <div className={`text-4xl font-mono font-bold tabular-nums transition-colors ${
            isRunning ? 'text-indigo-600' : 'text-slate-700'
          }`}>
            {formatDuration(elapsed)}
          </div>
          {isRunning && (
            <p className="text-xs text-slate-400 mt-1">
              Started {formatDistance(startTime, new Date(), { addSuffix: true })}
            </p>
          )}
        </div>

        {/* Notes + billable */}
        {isRunning && (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What are you working on?"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
            />
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={billable}
                onChange={e => setBillable(e.target.checked)}
                className="rounded"
              />
              Billable
            </label>
          </div>
        )}

        {/* Start/Stop button */}
        <button
          onClick={isRunning ? handleStop : handleStart}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-all ${
            isRunning
              ? 'bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-200'
              : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200'
          }`}
        >
          {isRunning ? '⏹ Stop Timer' : '▶ Start Timer'}
        </button>
      </div>

      {/* Summary */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-slate-800 font-mono">
              {formatDuration(totalSeconds)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Total time</div>
          </div>
          <div className="bg-indigo-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-indigo-700 font-mono">
              {formatDuration(billableSeconds)}
            </div>
            <div className="text-xs text-indigo-400 mt-0.5">Billable</div>
          </div>
        </div>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">Recent Entries</h4>
          {entries.slice(0, 10).map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 group transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${entry.billable ? 'bg-indigo-500' : 'bg-slate-300'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 truncate">{entry.notes || 'No description'}</div>
                <div className="text-xs text-slate-400">
                  {entry.startTime
                    ? formatDistance(new Date(entry.startTime), new Date(), { addSuffix: true })
                    : ''}
                </div>
              </div>
              <div className="font-mono text-sm text-slate-600 flex-shrink-0">
                {formatDuration(entry.duration || 0)}
              </div>
              <button
                onClick={() => handleDeleteEntry(entry.id)}
                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

---

### Step 3.2: Add TimeTracker to ProjectWorkspace

In **`src/components/ProjectWorkspace.jsx`**, find where workspace cards are rendered
and add a time tracker card:

```jsx
// Add import at top:
import { TimeTracker } from './advanced/TimeTracker.jsx'

// Add as a card in the workspace layout — find where DynamicCard components are rendered:
<DynamicCard title="Time Tracking" cardKey="time" layout={layout} onLayoutChange={setLayout}>
  <TimeTracker
    projectId={project.id}
    onEntryAdded={() => {
      // Optionally refresh project summary
    }}
  />
</DynamicCard>
```

---

## Part 4: Gantt Chart

A lightweight SVG-based Gantt chart using only tasks with `startDate` and `dueDate`.
No external library needed — keeps the single-file build constraint.

---

### Step 4.1: Create GanttChart Component

Create **`src/components/advanced/GanttChart.jsx`**:

```jsx
import React, { useMemo } from 'react'
import { useCRM } from '../../context.jsx'

const DAY_WIDTH = 30    // pixels per day
const ROW_HEIGHT = 40   // pixels per row
const HEADER_HEIGHT = 50
const LEFT_PANEL_WIDTH = 200

const STAGE_COLORS = {
  'Not Started': '#94a3b8',
  'In Progress':  '#6366f1',
  'On Hold':      '#f59e0b',
  'Completed':    '#22c55e',
  'Cancelled':    '#ef4444',
}

export const GanttChart = ({ projectId }) => {
  const { tasks, projects } = useCRM()

  const projectTasks = useMemo(() => {
    const filtered = projectId
      ? tasks.filter(t => t.projectId === projectId && (t.startDate || t.dueDate))
      : tasks.filter(t => t.startDate || t.dueDate)

    return filtered.map(t => ({
      ...t,
      start: t.startDate ? new Date(t.startDate) : new Date(t.dueDate || new Date()),
      end:   t.dueDate   ? new Date(t.dueDate)   : new Date(t.startDate || new Date()),
    })).filter(t => t.start <= t.end)
  }, [tasks, projectId])

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (!projectTasks.length) {
      const today = new Date()
      return { minDate: today, maxDate: new Date(today.getTime() + 30 * 86400000), totalDays: 30 }
    }

    const starts = projectTasks.map(t => t.start.getTime())
    const ends   = projectTasks.map(t => t.end.getTime())
    const min = new Date(Math.min(...starts))
    const max = new Date(Math.max(...ends))

    // Pad by 2 days on each side
    min.setDate(min.getDate() - 2)
    max.setDate(max.getDate() + 2)

    const totalDays = Math.ceil((max - min) / 86400000) + 1
    return { minDate: min, maxDate: max, totalDays }
  }, [projectTasks])

  const dayOffset = (date) =>
    Math.floor((date.getTime() - minDate.getTime()) / 86400000)

  const today = new Date()
  const todayOffset = dayOffset(today)

  const chartWidth  = LEFT_PANEL_WIDTH + totalDays * DAY_WIDTH
  const chartHeight = HEADER_HEIGHT + projectTasks.length * ROW_HEIGHT + 20

  // Generate month labels
  const months = useMemo(() => {
    const result = []
    let current = new Date(minDate)
    current.setDate(1)
    while (current <= maxDate) {
      result.push({
        label: current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        offset: dayOffset(current),
      })
      current.setMonth(current.getMonth() + 1)
    }
    return result
  }, [minDate, maxDate])

  if (!projectTasks.length) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
        <div className="text-3xl mb-3">📅</div>
        <p>No tasks with dates to display</p>
        <p className="text-xs mt-1">Add start or due dates to tasks to see them here</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200">
      <svg
        width={chartWidth}
        height={chartHeight}
        className="block"
        style={{ minWidth: chartWidth }}
      >
        {/* Background */}
        <rect width={chartWidth} height={chartHeight} fill="#f8fafc" />

        {/* Left panel background */}
        <rect width={LEFT_PANEL_WIDTH} height={chartHeight} fill="#f1f5f9" />

        {/* Vertical day grid lines */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const x = LEFT_PANEL_WIDTH + i * DAY_WIDTH
          const date = new Date(minDate.getTime() + i * 86400000)
          const isWeekend = date.getDay() === 0 || date.getDay() === 6
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={DAY_WIDTH}
              height={chartHeight}
              fill={isWeekend ? '#f0f4f8' : 'transparent'}
            />
          )
        })}

        {/* Header: Month labels */}
        <rect width={chartWidth} height={HEADER_HEIGHT} fill="white" />
        {months.map((m, i) => (
          <text
            key={i}
            x={LEFT_PANEL_WIDTH + m.offset * DAY_WIDTH + 6}
            y={20}
            fontSize={11}
            fill="#64748b"
            fontWeight="600"
          >
            {m.label}
          </text>
        ))}

        {/* Header: Day numbers */}
        {Array.from({ length: totalDays }).map((_, i) => {
          const date = new Date(minDate.getTime() + i * 86400000)
          if (totalDays < 60 || date.getDate() % 5 === 0) {
            return (
              <text
                key={i}
                x={LEFT_PANEL_WIDTH + i * DAY_WIDTH + DAY_WIDTH / 2}
                y={40}
                fontSize={9}
                fill="#94a3b8"
                textAnchor="middle"
              >
                {date.getDate()}
              </text>
            )
          }
          return null
        })}

        {/* Header bottom border */}
        <line x1={0} y1={HEADER_HEIGHT} x2={chartWidth} y2={HEADER_HEIGHT} stroke="#e2e8f0" strokeWidth={1} />

        {/* Today line */}
        {todayOffset >= 0 && todayOffset <= totalDays && (
          <line
            x1={LEFT_PANEL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2}
            y1={0}
            x2={LEFT_PANEL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2}
            y2={chartHeight}
            stroke="#6366f1"
            strokeWidth={1.5}
            strokeDasharray="4,3"
            opacity={0.6}
          />
        )}

        {/* Task rows */}
        {projectTasks.map((task, i) => {
          const y = HEADER_HEIGHT + i * ROW_HEIGHT
          const barX = LEFT_PANEL_WIDTH + dayOffset(task.start) * DAY_WIDTH
          const barW = Math.max((dayOffset(task.end) - dayOffset(task.start) + 1) * DAY_WIDTH, DAY_WIDTH)
          const color = STAGE_COLORS[task.status] || STAGE_COLORS['Not Started']
          const isDone = task.done || task.status === 'done' || task.status === 'Completed'

          return (
            <g key={task.id}>
              {/* Row background */}
              <rect x={0} y={y} width={chartWidth} height={ROW_HEIGHT} fill={i % 2 === 0 ? 'white' : '#fafafa'} />
              <line x1={0} y1={y + ROW_HEIGHT} x2={chartWidth} y2={y + ROW_HEIGHT} stroke="#f1f5f9" strokeWidth={1} />

              {/* Left label */}
              <text x={10} y={y + ROW_HEIGHT / 2 + 4} fontSize={12} fill={isDone ? '#94a3b8' : '#334155'} fontFamily="sans-serif">
                <tspan>{task.title?.slice(0, 22)}{(task.title?.length || 0) > 22 ? '…' : ''}</tspan>
              </text>

              {/* Gantt bar */}
              <rect
                x={barX + 3}
                y={y + 8}
                width={barW - 6}
                height={ROW_HEIGHT - 16}
                rx={4}
                fill={isDone ? '#dcfce7' : color}
                opacity={isDone ? 0.8 : 0.85}
              />

              {/* Done checkmark */}
              {isDone && (
                <text x={barX + barW / 2} y={y + ROW_HEIGHT / 2 + 5} textAnchor="middle" fontSize={12} fill="#16a34a">
                  ✓
                </text>
              )}

              {/* Bar label if wide enough */}
              {barW > 60 && !isDone && (
                <text
                  x={barX + barW / 2}
                  y={y + ROW_HEIGHT / 2 + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="white"
                  fontWeight="600"
                  fontFamily="sans-serif"
                >
                  {task.title?.slice(0, Math.floor(barW / 8))}
                </text>
              )}
            </g>
          )
        })}

        {/* Left panel border */}
        <line x1={LEFT_PANEL_WIDTH} y1={0} x2={LEFT_PANEL_WIDTH} y2={chartHeight} stroke="#e2e8f0" strokeWidth={1} />
      </svg>
    </div>
  )
}
```

---

### Step 4.2: Add Gantt View to App.jsx

Add Gantt as a new view mode option in **`src/App.jsx`**:

```javascript
// Import:
import { GanttChart } from './components/advanced/GanttChart.jsx'

// Add 'gantt' to viewMode options — in the view toggle buttons:
<button
  onClick={() => setViewMode('gantt')}
  className={`p-2 rounded-lg transition-colors ${viewMode === 'gantt' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
  title="Gantt Chart"
>
  📅
</button>

// In the content area, alongside canvas/kanban/grid/list:
{viewMode === 'gantt' && navSection === 'projects' && (
  <div className="p-6">
    <h2 className="text-lg font-bold text-slate-800 mb-4">Project Timeline</h2>
    <GanttChart />
  </div>
)}
```

---

## Part 5: Task Dependencies UI

Task `blockedBy` and `blocks` fields are in the schema. Add dependency badges to tasks.

### Step 5.1: Add Dependency Indicator to Task Cards

In **`src/components/ProjectWorkspace.jsx`** (or wherever tasks are rendered),
add a dependency badge:

```jsx
// In the task list item rendering, add after the task title:
{task.blockedBy?.length > 0 && (
  <span
    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full"
    title={`Blocked by ${task.blockedBy.length} task(s)`}
  >
    🔒 Blocked
  </span>
)}
{task.blocks?.length > 0 && (
  <span
    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full"
    title={`Blocks ${task.blocks.length} task(s)`}
  >
    ⛓ Blocks {task.blocks.length}
  </span>
)}
```

### Step 5.2: Add Dependency Selector to Task Edit Form

In the task edit form inside ProjectWorkspace, add a blocker picker:

```jsx
// Add this field to task editing UI:
const [dependencySearch, setDependencySearch] = useState('')

// Available tasks to block on (all tasks in same project, excluding self)
const availableBlockers = tasks.filter(t =>
  t.projectId === task.projectId &&
  t.id !== task.id &&
  (dependencySearch === '' || t.title.toLowerCase().includes(dependencySearch.toLowerCase()))
)

<div>
  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
    Blocked By
  </label>
  <input
    type="text"
    value={dependencySearch}
    onChange={e => setDependencySearch(e.target.value)}
    placeholder="Search tasks..."
    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mb-2 focus:outline-none focus:border-indigo-500"
  />
  <div className="max-h-32 overflow-y-auto space-y-1">
    {availableBlockers.map(t => {
      const isBlocked = (task.blockedBy || []).includes(t.id)
      return (
        <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
          <input
            type="checkbox"
            checked={isBlocked}
            onChange={async (e) => {
              const currentBlockers = task.blockedBy || []
              const newBlockers = e.target.checked
                ? [...currentBlockers, t.id]
                : currentBlockers.filter(id => id !== t.id)

              await DB.put('tasks', { ...task, blockedBy: newBlockers })
              // Also update the other task's 'blocks' array
              const otherBlocks = t.blocks || []
              const newBlocks = e.target.checked
                ? [...otherBlocks, task.id]
                : otherBlocks.filter(id => id !== task.id)
              await DB.put('tasks', { ...t, blocks: newBlocks })
            }}
            className="rounded"
          />
          <span className="text-sm text-slate-700 truncate">{t.title}</span>
        </label>
      )
    })}
  </div>
</div>
```

---

## Verification Steps

### GitHub Gist Backup (offline mode)
```bash
npm run dev
```
1. Create a GitHub PAT with `gist` scope at github.com
2. Log in → Offline mode → Environment Hub → "Configure Gist Backup"
3. Paste token → click "Validate" → see "Authenticated as @username"
4. Click "Create New Gist" → Gist ID appears → Save
5. Environment Hub → "Save to GitHub Gist" → toast "Vault saved to GitHub Gist"
6. Open github.com/gists → see a new private Gist with `active-assistant-vault.dat`

### Time Tracking
1. Open a project → workspace shows "Time Tracking" card
2. Click "▶ Start Timer" → timer counts up
3. Add a description → click "⏹ Stop Timer"
4. Entry appears in list with duration
5. Check DB: `DB.getAll('timeEntries')` in console → entry visible

### Gantt Chart
1. Ensure some tasks have `startDate` and `dueDate`
2. Click the 📅 view toggle in the header
3. Gantt renders — bars visible with task names
4. Today's date marked with a dashed purple line

### PWA Install (after build)
```bash
npm run build && npm run preview
```
1. Open in Chrome → address bar shows install icon (⊕)
2. Click → "Add to Home Screen" / "Install" dialog
3. Launch from home screen → runs as standalone app
4. DevTools → Application → Service Workers → verify registered
5. Network → Offline → reload → app loads from cache
