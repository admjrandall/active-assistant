// ============================================================================
// APP.JSX — Main application shell
// Storage modes:
//   'offline' → AuthGate screen → in-memory VaultDB → manual save to .dat
//   'm365'    → Microsoft 365 / Dataverse via dynamic configuration
// ============================================================================
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CRMContext, StorageModeContext } from './context.jsx'
import { Icons } from './components/Icons.jsx'
import { DataverseDB, setStorageMode, getStorageMode } from './db/index.js'
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

import { initRxDB, closeRxDB } from './sync/RxDBSetup.js'
import { RxDBWrapper } from './sync/RxDBWrapper.js'
import { startAllReplications } from './sync/M365Replication.js'


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

  // ── Environment Hub State ─────────────────────────────────────────────────────
  const [isEnvMenuOpen, setIsEnvMenuOpen] = useState(false)
  const envMenuRef = useRef(null)

  // ── Storage mode ──────────────────────────────────────────────────────────────
  const [storageMode, setStorageModeState] = useState(getStorageMode())
  // Sync mode state
const [syncStatus, setSyncStatus] = useState({ online: false, syncing: false, lastSync: null })
const [isSyncMode, setIsSyncMode] = useState(false)
  const [activeDB, setActiveDB]           = useState(() => getStorageMode() === 'm365' ? DataverseDB : VaultDB)
  const [m365AuthStatus, setM365AuthStatus] = useState('idle')
  const [m365UserName, setM365UserName]     = useState('')

  // Vault session context (Offline mode)
  const vaultCtxRef = useRef(null)   // { password }
  const [fileHandle, setFileHandle] = useState(null) // Native File System Handle

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

  // ── Smart Save (Native File System API) ───────────────────────────────────────
  const handleSaveVault = useCallback(async (forceDownload = false) => {
    const ctx = vaultCtxRef.current
    if (!ctx) return
    setSaveStatus('saving')
    try {
      const snapshot  = VaultDB.getSnapshot()
      const encrypted = await encryptVault(snapshot, ctx.password)
      const blob = new Blob([encrypted], { type: 'application/octet-stream' })

      // Attempt to use modern File System Access API for silent overwriting
      if (!forceDownload && 'showSaveFilePicker' in window) {
        try {
          let handle = fileHandle;
          if (!handle) {
            handle = await window.showSaveFilePicker({
              suggestedName: 'active-assistant-vault.dat',
              types: [{ description: 'Vault Data', accept: { 'application/octet-stream': ['.dat'] } }]
            });
            setFileHandle(handle);
          }
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          setSaveStatus('saved');
          showToast('Vault synced directly to disk.');
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            setSaveStatus('unsaved');
            return;
          }
          console.warn('File System API failed, falling back to standard download.', err);
        }
      }

      // Fallback for browsers without File System API, or if Force Download is requested
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = 'active-assistant-vault.dat'
      a.click()
      URL.revokeObjectURL(url)
      setSaveStatus('saved')
      showToast('Vault backup file downloaded.')
    } catch (err) {
      console.error('[Vault save]', err)
      setSaveStatus('error')
      showToast('Failed to save vault file.')
    }
  }, [fileHandle])

  // ── Global Ctrl+S Listener ────────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (storageMode === 'offline' && saveStatus === 'unsaved') {
          handleSaveVault();
        }
      }
    };
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [storageMode, saveStatus, handleSaveVault]);

  // ── Handle clicks outside the Environment Menu ────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (envMenuRef.current && !envMenuRef.current.contains(event.target)) {
        setIsEnvMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    
  } else if (mode === 'sync') {
    // NEW: RxDB Offline-first sync mode
    vaultCtxRef.current = { password }
    setIsSyncMode(true)
    setStorageMode('sync')
    setStorageModeState('sync')
    
    // Initialize RxDB with encryption
    const rxdb = await initRxDB(password)
    setActiveDB(RxDBWrapper)
    
    // Start M365 replication
    const replication = startAllReplications(rxdb, (status) => {
      if (status.pushed || status.pulled) {
        const msg = status.collection ? 
          `Synced ${status.collection}: ${status.pushed || 0} up, ${status.pulled || 0} down` :
          'Sync in progress...';
        showToast(msg)
      }
      setSyncStatus(prev => ({
        ...prev,
        online: navigator.onLine,
        syncing: status.syncing || false,
        lastSync: new Date().toISOString()
      }))
    })
    
    // Store replication state for cleanup
    window._rxdbReplication = replication
    
    await loadAllData()
    setDbReady(true)
    showToast('RxDB Sync Mode enabled. Works offline + auto-syncs with M365.')
    
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


  // ── Switch Environment / Lock Session ─────────────────────────────────────────
  const handleLockSession = useCallback(async () => {
    setSaveStatus('saving')
    try {
      if (storageMode === 'offline' && saveStatus === 'unsaved') {
        await handleSaveVault(true); 
      }
    } finally {
      // Stop RxDB replication
if (window._rxdbReplication) {
  window._rxdbReplication.cancelAll()
  window._rxdbReplication = null
}

// Close RxDB
if (isSyncMode) {
  await closeRxDB()
}

      VaultDB.clear()
      vaultCtxRef.current = null
      setFileHandle(null)

      // CRITICAL FIX: Wipe the saved mode so it forces the mode-select screen on reload
      localStorage.removeItem('aa-storage-mode')

      setDbReady(false)
      setProjects([]); setTasks([]); setPeople([])
      setDepartments([]); setClients([]); setCommunications([])

      // Force React to completely reset to the initial state
      window.location.reload()
    }
  }, [storageMode, saveStatus, handleSaveVault])

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

            {/* ── Header ── Z-INDEX FIXED TO HUGE NUMBER */}
            <header className="h-14 sm:h-16 acrylic border-b border-slate-200/50 flex items-center justify-between px-3 sm:px-8 z-[9999999] sticky top-0">
              
              {/* Left: Title & Data Button */}
              <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                <h1 className="font-semibold text-slate-800 tracking-tight text-base sm:text-lg whitespace-nowrap">Active Assistant</h1>
                <div className="hidden sm:block h-4 w-px bg-slate-300" />
                <button onClick={() => setIsDataModalOpen(true)} className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-md border border-slate-200 transition-colors">
                  <Icons.Database size={14} /> Data
                </button>
              </div>

              {/* Right: Actions & Environment Hub */}
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

                {/* ── Environment Hub Menu ── */}
                <div className="relative ml-2" ref={envMenuRef}>
                  <button 
                    onClick={() => setIsEnvMenuOpen(!isEnvMenuOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-sm"
                  >
<div className={`w-2 h-2 rounded-full ${
  storageMode === 'sync' ? (
    syncStatus.syncing ? 'bg-indigo-400 animate-pulse' :
    syncStatus.online ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
    'bg-amber-400'
  ) :
  storageMode === 'm365' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 
  saveStatus === 'saving' ? 'bg-indigo-400 animate-pulse' :
  saveStatus === 'unsaved' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse' : 
  saveStatus === 'error' ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
}`} />

                    <span className="text-sm font-medium text-slate-700 hidden sm:block">
                      {storageMode === 'sync' ? (syncStatus.online ? 'Auto-Sync' : 'Offline') :
                       storageMode === 'm365' ? 'M365 Sync' : 'Local Vault'}
                    </span>
                    <span className="text-xs text-slate-400 ml-1">▼</span>
                  </button>

                  {/* Dropdown Content */}
                  {isEnvMenuOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/60 overflow-hidden z-[100] py-1 animate-in fade-in slide-in-from-top-2">
                      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 mb-1">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Environment</p>
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {storageMode === 'm365' ? m365UserName : 'Air-Gapped Workflow'}
                        </p>
                      </div>

                      {storageMode === 'offline' && (
                        <>
                          <button onClick={() => { handleSaveVault(); setIsEnvMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors">
                            <span className="flex items-center gap-2">
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                              Save to Disk
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">Ctrl+S</span>
                          </button>
                          <button onClick={() => { handleSaveVault(true); setIsEnvMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Export Backup (.dat)
                          </button>
                        </>
                      )}

                      {storageMode === 'm365' && (
                         <button onClick={() => { loadAllData(); setIsEnvMenuOpen(false); showToast('Synced with Dataverse.'); }} className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                           Force Cloud Sync
                         </button>
                      )}

                      <div className="h-px bg-slate-100 my-1 mx-2" />

                      <button onClick={() => { 
                        setIsEnvMenuOpen(false); 
                        requestConfirm(
                          storageMode === 'offline' ? 'Switch Environment' : 'Sign Out', 
                          storageMode === 'offline' ? 'Save your work and close the vault? All data will be safely cleared from memory.' : 'Sign out and clear session data?', 
                          handleLockSession
                        ); 
                      }} className="w-full text-left px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Switch Environments
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </header>

            {/* ── Content area ── */}
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

            {/* ── Workspace drawers ── */}
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