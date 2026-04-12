// ============================================================================
// APP.JSX — Main application shell
// This file wires together all contexts, nav, and workspace components.
// Sub-components live in src/components/ — edit them independently.
// ============================================================================
import React, { useState, useEffect } from 'react'
import { CRMContext, StorageModeContext } from './context.jsx'
import { Icons } from './components/Icons.jsx'
import { DB, OfflineDB, DataverseDB, openDatabase, seedDatabase, getMsalApp, setStorageMode, getStorageMode } from './db/index.js'
import { M365_CONFIG } from './config.js'

// Workspace components — each in its own file for easy editing
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
import { ConfirmDialog }     from './components/ConfirmDialog.jsx'

const App = () => {
  const [dbReady, setDbReady]               = useState(false)
  const [projects, setProjects]             = useState([])
  const [tasks, setTasks]                   = useState([])
  const [people, setPeople]                 = useState([])
  const [departments, setDepartments]       = useState([])
  const [clients, setClients]               = useState([])
  const [communications, setCommunications] = useState([])

  const [navSection, setNavSection]   = useState('dashboard')
  const [viewMode, setViewMode]       = useState('canvas')
  const [activeProject, setActiveProject] = useState(null)
  const [activePerson, setActivePerson]   = useState(null)
  const [activeClient, setActiveClient]   = useState(null)

  const [toastMsg, setToastMsg]         = useState('')
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null })
  const [isDataModalOpen, setIsDataModalOpen] = useState(false)

  const [storageMode, setStorageModeState] = useState(getStorageMode())
  const [activeDB, setActiveDB]           = useState(() => getStorageMode() === 'm365' ? DataverseDB : OfflineDB)
  const [m365AuthStatus, setM365AuthStatus] = useState('idle')
  const [m365UserName, setM365UserName]     = useState('')
  const [isModeModalOpen, setIsModeModalOpen] = useState(false)

  const loadAllData = async () => {
    const [p, t, pe, d, c, comms] = await Promise.all([
      DB.getAll('projects'), DB.getAll('tasks'), DB.getAll('people'),
      DB.getAll('departments'), DB.getAll('clients'), DB.getAll('communications')
    ])
    setProjects(p.sort((a,b) => (a.sortOrder || 0) - (b.sortOrder || 0)))
    setTasks(t); setPeople(pe); setDepartments(d); setClients(c); setCommunications(comms)
  }

  const switchMode = async (newMode) => {
    if (newMode === storageMode) return
    if (newMode === 'm365') {
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
        setDbReady(false); await loadAllData(); setDbReady(true)
        showToast('Switched to Microsoft 365 / Dataverse mode.')
      } catch (err) {
        console.error('M365 auth error:', err)
        setM365AuthStatus('error')
        showToast('M365 sign-in failed. Staying in Offline mode.')
      }
    } else {
      setStorageMode('offline'); setStorageModeState('offline'); setActiveDB(OfflineDB)
      setM365AuthStatus('idle'); setM365UserName('')
      setDbReady(false); await openDatabase(); await loadAllData(); setDbReady(true)
      showToast('Switched to Offline / Local mode.')
    }
    setIsModeModalOpen(false)
  }

  useEffect(() => {
    const init = async () => {
      try {
        if (getStorageMode() === 'offline') {
          await openDatabase(); await seedDatabase()
        } else {
          try {
            const app = getMsalApp(); await app.initialize()
            const accounts = app.getAllAccounts()
            if (accounts.length > 0) {
              setM365UserName(accounts[0]?.name || accounts[0]?.username || 'M365 User')
              setM365AuthStatus('signed-in')
            } else {
              setStorageMode('offline'); setStorageModeState('offline')
              await openDatabase(); await seedDatabase()
            }
          } catch (_) {
            setStorageMode('offline'); setStorageModeState('offline')
            await openDatabase(); await seedDatabase()
          }
        }
        await loadAllData(); setDbReady(true)
      } catch (err) { console.error("DB Init Error:", err) }
    }
    init()
  }, [])

  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }
  const requestConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ isOpen: true, title, message, onConfirm: () => { onConfirm(); setConfirmDialog({ isOpen: false }) } })
  }

  const handleCreateProject = () => {
    const total = projects.length
    const newProj = {
      id: activeDB.generateId(), name: '', deptId: '', clientId: '', ownerId: '',
      stage: 'Lead', priority: 'Medium', sortOrder: total,
      x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70),
      startDate: '', dueDate: '', narrative: '', notes: [], lastTouch: new Date().toISOString(),
      isNew: true,
      workspaceLayout: {
        narrative: { x: 50, y: 100, w: 400, h: 300 }, tasks: { x: 480, y: 100, w: 450, h: 500 },
        notes: { x: 50, y: 420, w: 400, h: 300 }, details: { x: 950, y: 100, w: 300, h: 350 }
      }
    }
    setActiveProject(newProj)
  }

  const handleCreateClient = () => {
    const total = clients.length
    setActiveClient({ id: activeDB.generateId(), name: '', contactName: '', email: '', phone: '', notes: '', x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70), isNew: true })
  }

  const handleCreatePerson = () => {
    const total = people.length
    setActivePerson({ id: activeDB.generateId(), name: '', email: '', role: 'Contributor', x: 10 + ((total * 12) % 70), y: 10 + ((total * 12) % 70), isNew: true })
  }

  if (!dbReady) return (
    <div className="flex h-screen items-center justify-center text-slate-500">
      {storageMode === 'm365' ? 'Connecting to Microsoft 365…' : 'Loading Local Database v8...'}
    </div>
  )

  return (
    <StorageModeContext.Provider value={{ storageMode, switchMode, m365AuthStatus, m365UserName }}>
      <CRMContext.Provider value={{ projects, clients, people, tasks, departments, communications, DB: activeDB, loadAllData }}>
        <div className="flex h-full w-full relative">

          {/* ── Sidebar Nav ── */}
          <nav className="w-20 acrylic border-r border-slate-200/50 flex flex-col items-center py-6 gap-8 z-20 shadow-lg">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-200">AA</div>
            <div className="flex flex-col gap-4 w-full px-3">
              {[
                { key: 'dashboard', icon: <Icons.Layout />, label: 'Dash' },
                { key: 'clients',   icon: <Icons.Briefcase />, label: 'Dept' },
                { key: 'projects',  icon: <Icons.Folder />, label: 'Proj' },
                { key: 'people',    icon: <Icons.Users />, label: 'Team' },
              ].map(({ key, icon, label }, i) => (
                <React.Fragment key={key}>
                  {i === 1 && <div className="h-px w-8 bg-slate-200 mx-auto"></div>}
                  <button onClick={() => setNavSection(key)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${navSection === key ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'}`}>
                    {icon}
                    <span className="text-[9px] font-bold uppercase tracking-wider">{label}</span>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </nav>

          {/* ── Main Content ── */}
          <main className="flex-1 flex flex-col relative h-full">
            <header className="h-16 acrylic border-b border-slate-200/50 flex items-center justify-between px-8 z-10 sticky top-0">
              <div className="flex items-center gap-4">
                <h1 className="font-semibold text-slate-800 tracking-tight text-lg">Active Assistant</h1>
                <div className="h-4 w-px bg-slate-300"></div>
                <button onClick={() => setIsModeModalOpen(true)} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${storageMode === 'm365' ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' : 'text-slate-500 bg-slate-100 border-slate-200 hover:bg-slate-200'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${storageMode === 'm365' ? 'bg-blue-500' : 'bg-slate-400'}`}></span>
                  {storageMode === 'm365' ? `M365${m365UserName ? ` · ${m365UserName.split(' ')[0]}` : ''}` : 'Offline'}
                </button>
                <button onClick={() => setIsDataModalOpen(true)} className="ml-2 flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded-md border border-indigo-100 transition-colors">
                  <Icons.Database size={14} /> Data
                </button>
              </div>
              <div className="flex items-center gap-4">
                {navSection !== 'dashboard' && (
                  <div className="flex bg-slate-200/60 p-1 rounded-lg border border-slate-200/50">
                    <button onClick={() => setViewMode('canvas')} className={`p-1.5 rounded-md transition-all ${viewMode === 'canvas' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Spatial Canvas"><Icons.Grid /></button>
                    {navSection === 'projects' && <button onClick={() => setViewMode('kanban')} className={`p-1.5 rounded-md transition-all ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Kanban"><Icons.Kanban /></button>}
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="Cards Grid"><Icons.Cards /></button>
                    <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`} title="List View"><Icons.List /></button>
                  </div>
                )}
                {navSection === 'projects' && <button onClick={handleCreateProject} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /> New Project</button>}
                {navSection === 'clients'  && <button onClick={handleCreateClient}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /> Add Client</button>}
                {navSection === 'people'   && <button onClick={handleCreatePerson}  className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-md transition-colors"><Icons.Plus /> Add Member</button>}
              </div>
            </header>

            <div className={`flex-1 relative overflow-y-auto transition-all duration-500 ${(activeProject || activePerson || activeClient || confirmDialog.isOpen) ? 'blur-sm scale-[0.99] opacity-70 pointer-events-none' : ''}`}>
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

            {activeProject && <ProjectWorkspace project={activeProject} onClose={() => setActiveProject(null)} showToast={showToast} requestConfirm={requestConfirm} />}
            {activePerson  && <PersonWorkspace  person={activePerson}   onClose={() => setActivePerson(null)}  showToast={showToast} requestConfirm={requestConfirm} />}
            {activeClient  && <ClientWorkspace  client={activeClient}   onClose={() => setActiveClient(null)}  showToast={showToast} requestConfirm={requestConfirm} />}
            <DataManagementModal isOpen={isDataModalOpen} onClose={() => setIsDataModalOpen(false)} showToast={showToast} />
          </main>

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
                <p className="text-xs text-slate-500 mb-2">Choose where your data is saved.</p>
                <button onClick={() => switchMode('offline')} className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${storageMode === 'offline' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300 bg-white'}`}>
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${storageMode === 'offline' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icons.Database size={16} /></div>
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-sm text-slate-800">Offline</span>{storageMode === 'offline' && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded">Active</span>}</div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Saves to your browser's local IndexedDB. Works offline, private to this device.</p>
                  </div>
                </button>
                <button onClick={() => switchMode('m365')} disabled={m365AuthStatus === 'signing-in'} className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${storageMode === 'm365' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300 bg-white'}`}>
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${storageMode === 'm365' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <svg width="16" height="16" viewBox="0 0 23 23" fill="currentColor"><path d="M1 1h10v10H1zm11 0h10v10H12zM1 12h10v10H1zm11 0h10v10H12z"/></svg>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="font-semibold text-sm text-slate-800">Microsoft 365 / Dataverse</span>{storageMode === 'm365' && <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Active</span>}</div>
                    {storageMode === 'm365' && m365UserName ? <p className="text-xs text-blue-600 mt-0.5 font-medium">Signed in as {m365UserName}</p> : <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Syncs to your Dataverse environment. Requires M365 sign-in via popup.</p>}
                    {m365AuthStatus === 'signing-in' && <p className="text-xs text-blue-600 mt-1 animate-pulse">Signing in…</p>}
                    {m365AuthStatus === 'error' && <p className="text-xs text-rose-500 mt-1">Sign-in failed. Check your App Registration config.</p>}
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
