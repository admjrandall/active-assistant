// ============================================================================
// APP.JSX — Main application shell
// Storage modes:
//   'vault'  → VaultUnlock screen → in-memory VaultDB → auto-save to private Gist
//   'm365'   → Microsoft 365 / Dataverse
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CRMContext, StorageModeContext } from './context.jsx'
import { Icons } from './components/Icons.jsx'
import {
  DB, VaultDB, OfflineDB, DataverseDB,
  openDatabase, seedDatabase,
  getMsalApp, setStorageMode, getStorageMode,
} from './db/index.js'
import { M365_CONFIG } from './config.js'
import { encryptVault } from './vault/crypto.js'
import { saveVault }    from './vault/gist.js'
import { debounce }     from './utils.js'

// Workspace components
import { DashboardWorkspace } from './components/DashboardWorkspace.jsx'
import { ProjectWorkspace }   from './components/ProjectWorkspace.jsx'
import { ClientWorkspace }    from './components/ClientWorkspace.jsx'
import { PersonWorkspace }    from './components/PersonWorkspace.jsx'
import { DataManagementModal } from './components/DataManagementModal.jsx'

// View components
import { SpatialCanvas }     from './components/SpatialCanvas.jsx'
import { KanbanView }        from './components/KanbanView.jsx'
import { ProjectsGridView, ClientsGridView, PeopleGridView } from './components/GridViews.jsx'
import { ProjectsListView, ClientsListView, PeopleListView } from './components/ListViews.jsx'

// Shared UI
import { ConfirmDialog }  from './components/ConfirmDialog.jsx'
import { VaultUnlock }    from './components/VaultUnlock.jsx'

// ── Auto-save interval: encrypt + push vault 2s after the last change ─────────
const AUTO_SAVE_DEBOUNCE_MS = 2000

const App = () => {
  // ── Data ─────────────────────────────────────────────────────────────────────
  const [dbReady, setDbReady]               = useState(false)
  const [projects, setProjects]             = useState([])
  const [tasks, setTasks]                   = useState([])
  const [people, setPeople]                 = useState([])
  const [departments, setDepartments]       = useState([])
  const [clients, setClients]               = useState([])
  const [communications, setCommunications] = useState([])

  // ── Navigation ────────────────────────────────────────────────────────────────
  const [navSection, setNavSection]   = useState('dashboard')
  const [viewMode, setViewMode]       = useState('canvas')
  const [activeProject, setActiveProject] = useState(null)
  const [activePerson, setActivePerson]   = useState(null)
  const [activeClient, setActiveClient]   = useState(null)

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg]           = useState('')
  const [saveStatus, setSaveStatus]       = useState('saved')   // 'saved' | 'saving' | 'error'
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false })
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)
  const [isModeModalOpen, setIsModeModalOpen] = useState(false)

  // ── Storage mode ──────────────────────────────────────────────────────────────
  const [storageMode, setStorageModeState] = useState(getStorageMode())
  const [activeDB, setActiveDB]           = useState(
    () => getStorageMode() === 'm365' ? DataverseDB : VaultDB
  )
  const [m365AuthStatus, setM365AuthStatus] = useState('idle')
  const [m365UserName, setM365UserName]     = useState('')

  // Vault session context — held in ref so auto-save closure always has latest values
  const vaultCtxRef = useRef(null)   // { token, gistId, password }

  // ── Load all data from active DB ──────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    const [p, t, pe, d, c, comms] = await Promise.all([
      activeDB.getAll('projects'), activeDB.getAll('tasks'),
      activeDB.getAll('people'),   activeDB.getAll('departments'),
      activeDB.getAll('clients'),  activeDB.getAll('communications'),
    ])
    setProjects(p.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)))
    setTasks(t); setPeople(pe); setDepartments(d)
    setClients(c); setCommunications(comms)
  }, [activeDB])

  // ── Vault auto-save (Gist mode only) ─────────────────────────────────────────
  const persistVault = useCallback(async () => {
    const ctx = vaultCtxRef.current
    if (!ctx || ctx.mode !== 'gist') return
    setSaveStatus('saving')
    try {
      const snapshot  = VaultDB.getSnapshot()
      const encrypted = await encryptVault(snapshot, ctx.password)
      await saveVault(ctx.token, ctx.gistId, encrypted)
      setSaveStatus('saved')
    } catch (err) {
      console.error('[Vault auto-save]', err)
      setSaveStatus('error')
      showToast('Vault save failed — check your connection.')
    }
  }, [])

  // ── Download encrypted vault file (file mode) ─────────────────────────────────
  const downloadVault = useCallback(async () => {
    const ctx = vaultCtxRef.current
    if (!ctx) return
    setSaveStatus('saving')
    try {
      const snapshot  = VaultDB.getSnapshot()
      const encrypted = await encryptVault(snapshot, ctx.password)
      const blob = new Blob([encrypted], { type: 'application/octet-stream' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'active-assistant-vault.dat'
      a.click()
      URL.revokeObjectURL(url)
      setSaveStatus('saved')
    } catch (err) {
      console.error('[Vault download]', err)
      setSaveStatus('error')
      showToast('Failed to prepare vault file for download.')
    }
  }, [])

  // Stable debounced version (recreated only when persistVault changes)
  const debouncedPersist = useCallback(
    debounce(() => persistVault(), AUTO_SAVE_DEBOUNCE_MS),
    [persistVault]
  )

  // ── Called by VaultUnlock when the user successfully decrypts ─────────────────
  const handleVaultUnlocked = useCallback(async ({ token, gistId, password, mode }) => {
    vaultCtxRef.current = { token, gistId, password, mode }
    if (mode === 'file') {
      // File mode: track unsaved state only — user downloads manually
      VaultDB.onDataChange(() => setSaveStatus('unsaved'))
      setSaveStatus('saved')
    } else {
      // Gist mode: auto-save to GitHub on every change
      VaultDB.onDataChange(debouncedPersist)
    }
    setStorageMode('vault')
    setStorageModeState('vault')
    setActiveDB(VaultDB)
    await loadAllData()
    setDbReady(true)
  }, [debouncedPersist, loadAllData])

  // ── Lock vault: save immediately, wipe RAM, back to unlock screen ─────────────
  const handleLockVault = useCallback(async () => {
    const ctx = vaultCtxRef.current
    setSaveStatus('saving')
    try {
      if (ctx?.mode === 'file') {
        await downloadVault()   // triggers browser download before wiping
      } else {
        await persistVault()
      }
    } finally {
      VaultDB.clear()
      vaultCtxRef.current = null
      setDbReady(false)
      setStorageModeState('vault')
      setProjects([]); setTasks([]); setPeople([])
      setDepartments([]); setClients([]); setCommunications([])
    }
  }, [persistVault, downloadVault])

  // ── M365 mode ─────────────────────────────────────────────────────────────────
  const switchToM365 = async () => {
    setM365AuthStatus('signing-in')
    try {
      const app = getMsalApp()
      await app.initialize()
      let account = app.getAllAccounts()[0]
      if (!account) {
        const result = await app.loginPopup({ scopes: [`${M365_CONFIG.dataverseUrl}/.default`] })
        account = result.account
      }
      setM365UserName(account?.name || account?.username || 'M365 User')
      setM365AuthStatus('signed-in')
      setStorageMode('m365'); setStorageModeState('m365'); setActiveDB(DataverseDB)
      setDbReady(false)
      const [p, t, pe, d, c, comms] = await Promise.all([
        DataverseDB.getAll('projects'), DataverseDB.getAll('tasks'),
        DataverseDB.getAll('people'),   DataverseDB.getAll('departments'),
        DataverseDB.getAll('clients'),  DataverseDB.getAll('communications'),
      ])
      setProjects(p.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)))
      setTasks(t); setPeople(pe); setDepartments(d); setClients(c); setCommunications(comms)
      setDbReady(true)
      showToast('Switched to Microsoft 365 / Dataverse mode.')
    } catch (err) {
      console.error('M365 auth error:', err)
      setM365AuthStatus('error')
      showToast('M365 sign-in failed. Returning to vault mode.')
    }
    setIsModeModalOpen(false)
  }

  // ── On first load: try M365 re-auth if that was the last mode ─────────────────
  useEffect(() => {
    // MSAL creates hidden iframes that Chrome blocks on file:// — skip M365 entirely
    if (window.location.protocol === 'file:') {
      if (storageMode === 'm365') {
        setStorageMode('vault'); setStorageModeState('vault')
      }
      return
    }
    if (storageMode === 'm365') {
      (async () => {
        try {
          const app = getMsalApp(); await app.initialize()
          const accounts = app.getAllAccounts()
          if (accounts.length > 0) {
            setM365UserName(accounts[0]?.name || accounts[0]?.username || 'M365 User')
            setM365AuthStatus('signed-in')
            setActiveDB(DataverseDB)
            await loadAllData()
            setDbReady(true)
          } else {
            // No cached M365 session — fall back to vault unlock
            setStorageMode('vault'); setStorageModeState('vault')
          }
        } catch {
          setStorageMode('vault'); setStorageModeState('vault')
        }
      })()
    }
    // vault mode: VaultUnlock component handles the rest — nothing to do here
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Warn before closing tab if file-mode vault has unsaved changes ────────────
  useEffect(() => {
    const handler = (e) => {
      if (vaultCtxRef.current?.mode === 'file' && saveStatus === 'unsaved') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveStatus])

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3500) }
  const requestConfirm = (title, message, onConfirm) =>
    setConfirmDialog({ isOpen: true, title, message, onConfirm: () => { onConfirm(); setConfirmDialog({ isOpen: false }) } })

  const handleCreateProject = () => {
    const total  = projects.length
    setActiveProject({
      id: activeDB.generateId(), name: '', deptId: '', clientId: '', ownerId: '',
      stage: 'Lead', priority: 'Medium', sortOrder: total,
      x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70),
      startDate: '', dueDate: '', narrative: '', notes: [],
      lastTouch: new Date().toISOString(), isNew: true,
      workspaceLayout: {
        narrative: { x: 50, y: 100, w: 400, h: 300 }, tasks: { x: 480, y: 100, w: 450, h: 500 },
        notes: { x: 50, y: 420, w: 400, h: 300 }, details: { x: 950, y: 100, w: 300, h: 350 },
      },
    })
  }
  const handleCreateClient = () => {
    const total = clients.length
    setActiveClient({ id: activeDB.generateId(), name: '', contactName: '', email: '', phone: '', notes: '', x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70), isNew: true })
  }
  const handleCreatePerson = () => {
    const total = people.length
    setActivePerson({ id: activeDB.generateId(), name: '', email: '', role: 'Contributor', x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70), isNew: true })
  }

  // ── Nav items shared between sidebar and mobile bottom nav ────────────────────
  const NAV_ITEMS = [
    { key: 'dashboard', icon: <Icons.Layout />,   label: 'Dash' },
    { key: 'clients',   icon: <Icons.Briefcase />, label: 'Dept' },
    { key: 'projects',  icon: <Icons.Folder />,   label: 'Proj' },
    { key: 'people',    icon: <Icons.Users />,    label: 'Team' },
  ]

  // ── Vault unlock gate ─────────────────────────────────────────────────────────
  if (storageMode !== 'm365' && !dbReady) {
    return <VaultUnlock onUnlocked={handleVaultUnlocked} />
  }

  // ── M365 connecting spinner ───────────────────────────────────────────────────
  if (storageMode === 'm365' && !dbReady) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-500">
        Connecting to Microsoft 365…
      </div>
    )
  }

  // ── Save status indicator ─────────────────────────────────────────────────────
  const SaveIndicator = () => {
    if (storageMode !== 'vault') return null
    const isFileMode = vaultCtxRef.current?.mode === 'file'

    // File mode unsaved: show clickable download button
    if (isFileMode && saveStatus === 'unsaved') {
      return (
        <button
          onClick={downloadVault}
          title="Download encrypted vault file to save your changes"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border
                     text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Save file ↓
        </button>
      )
    }

    return (
      <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
        saveStatus === 'saving' ? 'text-amber-700 bg-amber-50 border-amber-200' :
        saveStatus === 'error'  ? 'text-rose-700 bg-rose-50 border-rose-200' :
                                  'text-emerald-700 bg-emerald-50 border-emerald-200'
      }`}>
        <span className={`w-1.5 h-1.5 rounded-full ${
          saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' :
          saveStatus === 'error'  ? 'bg-rose-400' :
                                    'bg-emerald-400'
        }`} />
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
      </div>
    )
  }

  return (
    <StorageModeContext.Provider value={{ storageMode, m365AuthStatus, m365UserName }}>
      <CRMContext.Provider value={{ projects, clients, people, tasks, departments, communications, DB: activeDB, loadAllData }}>
        <div className="flex h-full w-full relative">

          {/* ── Sidebar Nav (sm+) ── */}
          <nav className="hidden sm:flex w-20 acrylic border-r border-slate-200/50 flex-col items-center py-6 gap-8 z-20 shadow-lg">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-200">AA</div>
            <div className="flex flex-col gap-4 w-full px-3">
              {NAV_ITEMS.map(({ key, icon, label }, i) => (
                <React.Fragment key={key}>
                  {i === 1 && <div className="h-px w-8 bg-slate-200 mx-auto" />}
                  <button
                    onClick={() => setNavSection(key)}
                    className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                      navSection === key
                        ? 'bg-white text-indigo-600 shadow-sm border border-slate-100'
                        : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'
                    }`}
                  >
                    {icon}
                    <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </nav>

          {/* ── Main Content ── */}
          <main className="flex-1 flex flex-col relative h-full min-w-0">

            {/* Header */}
            <header className="h-14 sm:h-16 acrylic border-b border-slate-200/50 flex items-center justify-between px-3 sm:px-8 z-10 sticky top-0">
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <h1 className="font-semibold text-slate-800 tracking-tight text-base sm:text-lg whitespace-nowrap">Active Assistant</h1>
                <div className="hidden sm:block h-4 w-px bg-slate-300" />

                {/* Storage mode badge */}
                <button
                  onClick={() => setIsModeModalOpen(true)}
                  className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${
                    storageMode === 'm365'
                      ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
                      : 'text-indigo-700 bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${storageMode === 'm365' ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                  {storageMode === 'm365'
                    ? `M365${m365UserName ? ` · ${m365UserName.split(' ')[0]}` : ''}`
                    : 'Vault'}
                </button>

                <SaveIndicator />

                <button
                  onClick={() => setIsDataModalOpen(true)}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-md border border-slate-200 transition-colors"
                >
                  <Icons.Database size={14} /> Data
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {/* View mode toggles */}
                {navSection !== 'dashboard' && (
                  <div className="flex bg-slate-200/60 p-0.5 sm:p-1 rounded-lg border border-slate-200/50">
                    <button onClick={() => setViewMode('canvas')} className={`p-1.5 rounded-md transition-all ${viewMode === 'canvas' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Spatial Canvas"><Icons.Grid /></button>
                    {navSection === 'projects' && <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Kanban"><Icons.Kanban /></button>}
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Cards Grid"><Icons.Cards /></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="List View"><Icons.List /></button>
                  </div>
                )}

                {/* Create buttons */}
                {navSection === 'projects' && <button onClick={handleCreateProject} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">New Project</span></button>}
                {navSection === 'clients'  && <button onClick={handleCreateClient}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">Add Client</span></button>}
                {navSection === 'people'   && <button onClick={handleCreatePerson}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">Add Member</span></button>}

                {/* Lock button (vault mode only) */}
                {storageMode === 'vault' && (
                  <button
                    onClick={() => requestConfirm('Lock Vault', 'Save your work and lock the vault? All data will be cleared from memory.', handleLockVault)}
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 px-2.5 py-2 rounded-lg border border-slate-200 transition-colors"
                    title="Save & lock vault"
                  >
                    <Icons.Close size={14} />
                    <span className="hidden sm:inline">Lock</span>
                  </button>
                )}
              </div>
            </header>

            {/* Content area */}
            <div className={`flex-1 relative overflow-y-auto transition-all duration-500 pb-16 sm:pb-0 ${
              (activeProject || activePerson || activeClient || confirmDialog.isOpen)
                ? 'blur-sm scale-[0.99] opacity-70 pointer-events-none'
                : ''
            }`}>
              {navSection === 'dashboard' && <DashboardWorkspace showToast={showToast} requestConfirm={requestConfirm} onOpenProject={setActiveProject} onOpenClient={setActiveClient} onOpenPerson={setActivePerson} onCreateProject={handleCreateProject} onCreateClient={handleCreateClient} onCreatePerson={handleCreatePerson} />}

              {navSection === 'projects' && viewMode === 'canvas'  && <SpatialCanvas type="projects" onOpenItem={setActiveProject} />}
              {navSection === 'clients'  && viewMode === 'canvas'  && <SpatialCanvas type="clients"  onOpenItem={setActiveClient} />}
              {navSection === 'people'   && viewMode === 'canvas'  && <SpatialCanvas type="people"   onOpenItem={setActivePerson} />}
              {navSection === 'projects' && viewMode === 'kanban'  && <KanbanView onOpenProject={setActiveProject} />}
              {navSection === 'projects' && viewMode === 'grid'    && <ProjectsGridView onOpenProject={setActiveProject} />}
              {navSection === 'clients'  && viewMode === 'grid'    && <ClientsGridView  onOpenClient={setActiveClient} />}
              {navSection === 'people'   && viewMode === 'grid'    && <PeopleGridView   onOpenPerson={setActivePerson} />}
              {navSection === 'projects' && viewMode === 'list'    && <ProjectsListView onOpenProject={setActiveProject} />}
              {navSection === 'clients'  && viewMode === 'list'    && <ClientsListView  onOpenClient={setActiveClient} />}
              {navSection === 'people'   && viewMode === 'list'    && <PeopleListView   onOpenPerson={setActivePerson} />}
            </div>

            {/* Workspace drawers */}
            {activeProject && <ProjectWorkspace project={activeProject} onClose={() => setActiveProject(null)} showToast={showToast} requestConfirm={requestConfirm} />}
            {activePerson  && <PersonWorkspace  person={activePerson}   onClose={() => setActivePerson(null)}  showToast={showToast} requestConfirm={requestConfirm} />}
            {activeClient  && <ClientWorkspace  client={activeClient}   onClose={() => setActiveClient(null)}  showToast={showToast} requestConfirm={requestConfirm} />}

            <DataManagementModal isOpen={isDataModalOpen} onClose={() => setIsDataModalOpen(false)} showToast={showToast} />
          </main>

          {/* ── Mobile Bottom Nav ── */}
          <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 acrylic border-t border-slate-200/50 flex items-center justify-around px-2 py-1 safe-area-bottom">
            {NAV_ITEMS.map(({ key, icon, label }) => (
              <button key={key} onClick={() => setNavSection(key)} className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all ${navSection === key ? 'text-indigo-600' : 'text-slate-500'}`}>
                {icon}
                <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
              </button>
            ))}
          </nav>

          <ConfirmDialog isOpen={confirmDialog.isOpen} title={confirmDialog.title} message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} />

          {toastMsg && (
            <div className="toast-enter fixed bottom-6 right-6 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-medium z-[110] flex items-center gap-2">
              <Icons.Check /> {toastMsg}
            </div>
          )}
        </div>

        {/* ── Storage Mode Modal ── */}
        {isModeModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModeModalOpen(false)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl z-[110] overflow-hidden modal-enter">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800">Storage Mode</h2>
                <button onClick={() => setIsModeModalOpen(false)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500"><Icons.Close size={18} /></button>
              </div>
              <div className="p-6 flex flex-col gap-3">
                <p className="text-xs text-slate-500 mb-2">Choose where your data is stored.</p>

                {/* Vault mode */}
                <div className={`flex items-start gap-4 p-4 rounded-xl border-2 ${storageMode === 'vault' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${storageMode === 'vault' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Icons.Database size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800">Encrypted Vault</span>
                      {storageMode === 'vault' && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">AES-256-GCM. Data lives in memory only — encrypted and synced to your private GitHub Gist.</p>
                    {storageMode === 'vault' && (
                      <button onClick={() => { setIsModeModalOpen(false); requestConfirm('Lock Vault', 'Save and lock the vault? Memory will be cleared.', handleLockVault) }}
                        className="mt-2 text-xs font-semibold text-rose-600 hover:underline">
                        Save & Lock →
                      </button>
                    )}
                  </div>
                </div>

                {/* M365 mode */}
                <button onClick={switchToM365} disabled={m365AuthStatus === 'signing-in'} className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${storageMode === 'm365' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'}`}>
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${storageMode === 'm365' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <svg width="16" height="16" viewBox="0 0 23 23" fill="currentColor"><path d="M1 1h10v10H1zm11 0h10v10H12zM1 12h10v10H1zm11 0h10v10H12z"/></svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800">Microsoft 365 / Dataverse</span>
                      {storageMode === 'm365' && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Active</span>}
                    </div>
                    {storageMode === 'm365' && m365UserName
                      ? <p className="text-xs text-blue-600 mt-0.5 font-medium">Signed in as {m365UserName}</p>
                      : <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Syncs to your Dataverse environment. Requires M365 sign-in.</p>}
                    {m365AuthStatus === 'signing-in' && <p className="text-xs text-blue-600 mt-1 animate-pulse">Signing in…</p>}
                    {m365AuthStatus === 'error'      && <p className="text-xs text-rose-500 mt-1">Sign-in failed. Check your App Registration config.</p>}
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </CRMContext.Provider>
    </StorageModeContext.Provider>
  )
}

export default App
