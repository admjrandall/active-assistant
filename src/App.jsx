// ============================================================================
// APP.JSX — Main application shell
// Storage modes:
//   'offline' → AuthGate screen → in-memory VaultDB → manual save to .dat
//   'm365'    → Microsoft 365 / Dataverse via dynamic configuration
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CRMContext, StorageModeContext } from './context.jsx'
import { Icons } from './components/Icons.jsx'
import {
  DataverseDB, setStorageMode, getStorageMode,
} from './db/index.js'
import { VaultDB } from './vault/VaultDB.js'
import { encryptVault } from './vault/crypto.js'

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
import { AuthGate }       from './components/AuthGate.jsx'

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
  const [navSection, setNavSection]       = useState('dashboard')
  const [viewMode, setViewMode]           = useState('canvas')
  const [activeProject, setActiveProject] = useState(null)
  const [activePerson, setActivePerson]   = useState(null)
  const [activeClient, setActiveClient]   = useState(null)

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [toastMsg, setToastMsg]           = useState('')
  const [saveStatus, setSaveStatus]       = useState('saved')   // 'saved' | 'unsaved' | 'saving' | 'error'
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false })
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)

  // ── Storage mode ──────────────────────────────────────────────────────────────
  const [storageMode, setStorageModeState] = useState(getStorageMode())
  const [activeDB, setActiveDB]           = useState(
    () => getStorageMode() === 'm365' ? DataverseDB : VaultDB
  )
  const [m365AuthStatus, setM365AuthStatus] = useState('idle')
  const [m365UserName, setM365UserName]     = useState('')

  // Vault session context (Offline mode)
  const vaultCtxRef = useRef(null)   // { password }

  // ── Load all data from active DB ──────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    try {
      const [p, t, pe, d, c, comms] = await Promise.all([
        activeDB.getAll('projects'), activeDB.getAll('tasks'),
        activeDB.getAll('people'),   activeDB.getAll('departments'),
        activeDB.getAll('clients'),  activeDB.getAll('communications'),
      ])
      setProjects(p.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)))
      setTasks(t); setPeople(pe); setDepartments(d)
      setClients(c); setCommunications(comms)
    } catch (err) {
      console.error("Failed to load data:", err)
      showToast("Error loading data from database.")
    }
  }, [activeDB])

  // ── Download encrypted vault file (Offline mode) ──────────────────────────────
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
      showToast('Vault file downloaded successfully.')
    } catch (err) {
      console.error('[Vault download]', err)
      setSaveStatus('error')
      showToast('Failed to prepare vault file for download.')
    }
  }, [])

  // ── Called by AuthGate when successfully authenticated ────────────────────────
  const handleAppUnlocked = useCallback(async ({ mode, password, account }) => {
    if (mode === 'offline') {
      vaultCtxRef.current = { password }
      VaultDB.onDataChange(() => setSaveStatus('unsaved'))
      setSaveStatus('saved')
      setStorageMode('offline')
      setStorageModeState('offline')
      setActiveDB(VaultDB)
      await loadAllData()
      setDbReady(true)
      showToast('Offline vault unlocked.')
    } else if (mode === 'm365') {
      setM365UserName(account?.name || account?.username || 'M365 User')
      setM365AuthStatus('signed-in')
      setStorageMode('m365')
      setStorageModeState('m365')
      setActiveDB(DataverseDB)
      await loadAllData()
      setDbReady(true)
      showToast('Connected to Microsoft 365.')
    }
  }, [loadAllData])

  // ── Lock session / Sign out ───────────────────────────────────────────────────
  const handleLockSession = useCallback(async () => {
    setSaveStatus('saving')
    try {
      if (storageMode === 'offline' && saveStatus === 'unsaved') {
        await downloadVault()
      }
    } finally {
      VaultDB.clear()
      vaultCtxRef.current = null
      setDbReady(false)
      setProjects([]); setTasks([]); setPeople([])
      setDepartments([]); setClients([]); setCommunications([])
      if (storageMode === 'm365') {
         // Force reload to trigger AuthGate MSAL check if needed
         window.location.reload()
      }
    }
  }, [storageMode, saveStatus, downloadVault])

  // ── Warn before closing tab if offline mode has unsaved changes ───────────────
  useEffect(() => {
    const handler = (e) => {
      if (storageMode === 'offline' && saveStatus === 'unsaved') {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [storageMode, saveStatus])

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

  // ── Nav items ─────────────────────────────────────────────────────────────────
  const NAV_ITEMS = [
    { key: 'dashboard', icon: <Icons.Layout />,    label: 'Dash' },
    { key: 'clients',   icon: <Icons.Briefcase />, label: 'Clients' },
    { key: 'projects',  icon: <Icons.Folder />,    label: 'Proj' },
    { key: 'people',    icon: <Icons.Users />,     label: 'Team' },
  ]

  // ── Auth Gate ─────────────────────────────────────────────────────────────────
  if (!dbReady) {
    return <AuthGate onUnlocked={handleAppUnlocked} />
  }

  // ── Save status indicator ─────────────────────────────────────────────────────
  const SaveIndicator = () => {
    if (storageMode !== 'offline') return null

    if (saveStatus === 'unsaved') {
      return (
        <button onClick={downloadVault} title="Download encrypted vault file to save your changes"
          className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors">
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
          saveStatus === 'error'  ? 'bg-rose-400' : 'bg-emerald-400'
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
                  <button onClick={() => setNavSection(key)}
                    className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${
                      navSection === key ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'
                    }`}>
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

                <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${
                    storageMode === 'm365' ? 'text-blue-700 bg-blue-50 border-blue-200' : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${storageMode === 'm365' ? 'bg-blue-500' : 'bg-indigo-500'}`} />
                  {storageMode === 'm365' ? `M365 · ${m365UserName.split(' ')[0]}` : 'Offline Vault'}
                </div>

                <SaveIndicator />

                <button onClick={() => setIsDataModalOpen(true)} className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-md border border-slate-200 transition-colors">
                  <Icons.Database size={14} /> Data
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                {navSection !== 'dashboard' && (
                  <div className="flex bg-slate-200/60 p-0.5 sm:p-1 rounded-lg border border-slate-200/50">
                    <button onClick={() => setViewMode('canvas')} className={`p-1.5 rounded-md transition-all ${viewMode === 'canvas' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Spatial Canvas"><Icons.Grid /></button>
                    {navSection === 'projects' && <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Kanban"><Icons.Kanban /></button>}
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Cards Grid"><Icons.Cards /></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="List View"><Icons.List /></button>
                  </div>
                )}

                {navSection === 'projects' && <button onClick={handleCreateProject} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">New Project</span></button>}
                {navSection === 'clients'  && <button onClick={handleCreateClient}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">Add Client</span></button>}
                {navSection === 'people'   && <button onClick={handleCreatePerson}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-2 sm:px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /><span className="hidden sm:inline">Add Member</span></button>}

                <button
                  onClick={() => requestConfirm(storageMode === 'offline' ? 'Lock Vault' : 'Sign Out', storageMode === 'offline' ? 'Save your work and lock the vault? All data will be cleared from memory.' : 'Sign out and clear session data?', handleLockSession)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 px-2.5 py-2 rounded-lg border border-slate-200 transition-colors"
                  title="Lock Session"
                >
                  <Icons.Close size={14} />
                  <span className="hidden sm:inline">Lock</span>
                </button>
              </div>
            </header>

            {/* Content area */}
            <div className={`flex-1 relative overflow-y-auto transition-all duration-500 pb-16 sm:pb-0 ${
              (activeProject || activePerson || activeClient || confirmDialog.isOpen) ? 'blur-sm scale-[0.99] opacity-70 pointer-events-none' : ''
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
      </CRMContext.Provider>
    </StorageModeContext.Provider>
  )
}

export default App