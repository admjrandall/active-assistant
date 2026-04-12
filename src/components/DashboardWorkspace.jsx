import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCRM } from '../context.jsx'
import { Icons } from './Icons.jsx'
import { DynamicCard } from './DynamicCard.jsx'
import { sanitizeInput, debounce, isValidDateValue, getDaysUntil, formatDisplayDate, isClosedProject, getPriorityWeight, clampNumber, getDueLabel } from '../utils.js'
import { MAX_ZINDEX } from '../config.js'

const MAX_TEXT_LENGTH = 10000
const MAX_TITLE_LENGTH = 500

const DUE_SOON_DAYS = 7;
const MAX_LIST_ITEMS = 6;
const MAX_ACTIVITY_ITEMS = 8;
const PREVIEW_TEXT_LENGTH = 180;
const STORAGE_KEY = 'active-assistant-dashboard-layout-v1';

const DASHBOARD_MESSAGES = {
  LAYOUT_SAVED: 'Dashboard layout saved.',
  LAYOUT_SAVE_FAILED: 'Failed to save dashboard layout.',
  LAYOUT_RESET: 'Dashboard layout reset.',
  CONFIRM_RESET: 'Reset the dashboard canvas to the default arrangement?',
};

// Normalized stacking order based on your preferences
const DEFAULT_Z_INDEXES = { overview: 10, activity: 11, clients: 12, team: 13, attention: 14, actions: 15 };

// Your exact saved coordinates and sizes
const DEFAULT_LAYOUTS = {
  overview: { x: 40, y: 40, w: 475, h: 630 }, 
  attention: { x: 542, y: 39, w: 367, h: 284 },
  activity: { x: 939, y: 40, w: 368, h: 592 }, 
  team: { x: 45, y: 690, w: 470, h: 278 },
  clients: { x: 940, y: 657, w: 367, h: 308 }, 
  actions: { x: 545, y: 350, w: 369, h: 618 },
};

const normalizeLayout = (candidate, fallback) => ({
  x: clampNumber(candidate?.x, 0, 5000, fallback.x), y: clampNumber(candidate?.y, 0, 5000, fallback.y),
  w: clampNumber(candidate?.w, 250, 1800, fallback.w), h: clampNumber(candidate?.h, 150, 1800, fallback.h),
});

const readDashboardPreferences = () => {
  const fallback = { layouts: { ...DEFAULT_LAYOUTS }, zIndexes: { ...DEFAULT_Z_INDEXES } };
  if (typeof window === 'undefined') return fallback;
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return fallback;
    const parsed = JSON.parse(rawValue);
    const layouts = Object.keys(DEFAULT_LAYOUTS).reduce((acc, cardId) => { acc[cardId] = normalizeLayout(parsed?.layouts?.[cardId], DEFAULT_LAYOUTS[cardId]); return acc; }, {});
    const zIndexes = Object.keys(DEFAULT_Z_INDEXES).reduce((acc, cardId) => { acc[cardId] = Number.isFinite(parsed?.zIndexes?.[cardId]) ? parsed.zIndexes[cardId] : DEFAULT_Z_INDEXES[cardId]; return acc; }, {});
    return { layouts, zIndexes };
  } catch (error) { return fallback; }
};

const persistDashboardPreferences = (layouts, zIndexes) => {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ layouts, zIndexes }));
};

const MetricTile = ({ label, value, hint }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    <div className="mt-1 text-xs text-slate-500">{hint}</div>
  </div>
);

const DashboardWorkspace = ({ showToast, requestConfirm, onOpenProject, onOpenClient, onOpenPerson, onCreateProject, onCreateClient, onCreatePerson }) => {
  const { projects, tasks, clients, people, communications } = useCRM();
  
  // NEW: We use isEditMode instead of isCanvasMode
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [workspaceLayouts, setWorkspaceLayouts] = useState(() => readDashboardPreferences().layouts);
  const [cardZIndexes, setCardZIndexes] = useState(() => readDashboardPreferences().zIndexes);
  const [expandedModal, setExpandedModal] = useState(null);

  const projectsMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p])), [projects]);
  const clientsMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const peopleMap = useMemo(() => Object.fromEntries(people.map(p => [p.id, p])), [people]);
  const activeProjects = useMemo(() => projects.filter(p => !isClosedProject(p)), [projects]);
  const openTasks = useMemo(() => tasks.filter(t => !t.done), [tasks]);
  const overdueTasksCount = useMemo(() => openTasks.filter(t => (getDaysUntil(t.dueDate) ?? 999) < 0).length, [openTasks]);
  const dueSoonTasksCount = useMemo(() => openTasks.filter(t => { const dd = getDaysUntil(t.dueDate); return dd !== null && dd >= 0 && dd <= DUE_SOON_DAYS; }).length, [openTasks]);
  const unassignedTasksCount = useMemo(() => openTasks.filter(t => !t.assigneeId).length, [openTasks]);
  const unassignedProjectsCount = useMemo(() => activeProjects.filter(p => !p.ownerId).length, [activeProjects]);

  const stageBreakdown = useMemo(() => {
    const counts = activeProjects.reduce((acc, p) => { acc[p.stage || 'Unstaged'] = (acc[p.stage || 'Unstaged'] || 0) + 1; return acc; }, {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, MAX_LIST_ITEMS);
  }, [activeProjects]);

  const attentionItems = useMemo(() => openTasks.map(task => ({
      ...task, project: projectsMap[task.projectId], assignee: peopleMap[task.assigneeId], dueInDays: getDaysUntil(task.dueDate), priorityWeight: getPriorityWeight(projectsMap[task.projectId]?.priority),
    })).filter(t => t.dueInDays !== null && t.dueInDays <= DUE_SOON_DAYS).sort((a, b) => {
      if (a.dueInDays !== b.dueInDays) return a.dueInDays - b.dueInDays;
      if (a.priorityWeight !== b.priorityWeight) return b.priorityWeight - a.priorityWeight;
      return String(a.title || '').localeCompare(String(b.title || ''));
    }).slice(0, MAX_LIST_ITEMS), [openTasks, peopleMap, projectsMap]);

  const recentActivity = useMemo(() => {
    const notes = projects.flatMap(p => (Array.isArray(p.notes) ? p.notes : []).map(n => ({
      id: `note-${n.id}`, type: 'Project Note', title: p.name || 'Unnamed Project', subtitle: clientsMap[p.clientId]?.name || 'No client linked',
      body: sanitizeInput(n.text || '', PREVIEW_TEXT_LENGTH), timestamp: n.date, entityType: 'project', entity: p, actionLabel: 'Open Project',
    })));
    const comms = communications.map(c => {
      const client = clientsMap[c.clientId];
      return {
        id: `communication-${c.id}`, type: c.type || 'Communication', title: client?.name || 'Unknown Client', subtitle: client?.contactName || 'No contact on file',
        body: sanitizeInput(c.notes || '', PREVIEW_TEXT_LENGTH), timestamp: c.date, entityType: client ? 'client' : null, entity: client || null, actionLabel: 'Open Client',
      };
    });
    return [...notes, ...comms].filter(e => isValidDateValue(e.timestamp)).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [clientsMap, communications, projects]);

  const teamLoad = useMemo(() => people.map(person => {
    const ownedProjects = activeProjects.filter(p => p.ownerId === person.id).length;
    const assignedTasks = openTasks.filter(t => t.assigneeId === person.id).length;
    return { person, ownedProjects, assignedTasks, totalLoad: ownedProjects + assignedTasks };
  }).sort((a, b) => b.totalLoad - a.totalLoad || String(a.person.name || '').localeCompare(String(b.person.name || ''))).slice(0, MAX_LIST_ITEMS), [activeProjects, openTasks, people]);

  const clientPulse = useMemo(() => clients.map(client => {
    const relatedProjects = activeProjects.filter(p => p.clientId === client.id);
    const relatedIds = new Set(relatedProjects.map(p => p.id));
    const urgentTasks = openTasks.filter(t => { const dd = getDaysUntil(t.dueDate); return relatedIds.has(t.projectId) && dd !== null && dd <= DUE_SOON_DAYS; }).length;
    const latestCommunication = communications.filter(c => c.clientId === client.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    return { client, activeProjectCount: relatedProjects.length, urgentTasks, latestCommunication };
  }).sort((a, b) => b.activeProjectCount - a.activeProjectCount || b.urgentTasks - a.urgentTasks).slice(0, MAX_LIST_ITEMS), [activeProjects, clients, communications, openTasks]);

  const freshestProject = useMemo(() => [...projects].filter(p => isValidDateValue(p.lastTouch)).sort((a, b) => new Date(b.lastTouch) - new Date(a.lastTouch))[0], [projects]);

  const debouncedPersist = useMemo(() => debounce((layouts, zIndexes) => {
    try { persistDashboardPreferences(layouts, zIndexes); } catch (error) { showToast?.(DASHBOARD_MESSAGES.LAYOUT_SAVE_FAILED); }
  }, 500), [showToast]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      persistDashboardPreferences(workspaceLayouts, cardZIndexes);
      showToast?.(DASHBOARD_MESSAGES.LAYOUT_SAVED);
    } catch (error) { showToast?.(DASHBOARD_MESSAGES.LAYOUT_SAVE_FAILED); } finally { setIsSaving(false); }
  }, [cardZIndexes, isSaving, showToast, workspaceLayouts]);

  const transitionToWorkspace = useCallback((callback, payload) => {
    if (!isSaving && callback) callback(payload);
  }, [isSaving]);

  const handleActivityEntryOpen = useCallback((entry) => {
    if (entry?.entityType === 'project' && entry.entity) transitionToWorkspace(onOpenProject, entry.entity);
    if (entry?.entityType === 'client' && entry.entity) transitionToWorkspace(onOpenClient, entry.entity);
  }, [onOpenClient, onOpenProject, transitionToWorkspace]);

  const bringToFront = useCallback((cardId) => {
    setCardZIndexes((prev) => {
      const maxZ = Math.max(...Object.values(prev));
      if (maxZ >= MAX_ZINDEX) {
        const normalized = Object.entries(prev).sort((a, b) => a[1] - b[1]).reduce((acc, [id], index) => { acc[id] = 10 + index; return acc; }, {});
        normalized[cardId] = 10 + Object.keys(prev).length; return normalized;
      }
      return { ...prev, [cardId]: maxZ + 1 };
    });
  }, []);

  const handleLayoutUpdate = useCallback((cardId, newLayout) => {
    if (DEFAULT_LAYOUTS[cardId]) setWorkspaceLayouts((prev) => ({ ...prev, [cardId]: normalizeLayout(newLayout, DEFAULT_LAYOUTS[cardId]) }));
  }, []);

  const handleResetLayout = useCallback(() => {
    const applyReset = () => {
      setWorkspaceLayouts(DEFAULT_LAYOUTS);
      setCardZIndexes(DEFAULT_Z_INDEXES);
      setLayoutVersion((prev) => prev + 1);
      try { persistDashboardPreferences(DEFAULT_LAYOUTS, DEFAULT_Z_INDEXES); showToast?.(DASHBOARD_MESSAGES.LAYOUT_RESET); } catch (error) {}
    };
    if (requestConfirm) requestConfirm('Reset Dashboard Layout', DASHBOARD_MESSAGES.CONFIRM_RESET, applyReset); else applyReset();
  }, [requestConfirm, showToast]);

  useEffect(() => { debouncedPersist(workspaceLayouts, cardZIndexes); }, [cardZIndexes, debouncedPersist, workspaceLayouts]);
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, isSaving]);

  const OverviewUI = () => (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-sky-600 to-cyan-500 p-5 text-white shadow-lg">
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">Portfolio Snapshot</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">{activeProjects.length} active projects and {openTasks.length} open tasks</h3>
        <p className="mt-2 text-sm text-white/80">A quick view of work in motion, upcoming deadlines, and current coverage.</p>
        {freshestProject && <div className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1 text-xs">Latest touch: {freshestProject.name || 'Unnamed Project'}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Projects" value={projects.length} hint={`${activeProjects.length} active`} />
        <MetricTile label="Tasks" value={openTasks.length} hint={`${dueSoonTasksCount} due soon`} />
        <MetricTile label="Clients" value={clients.length} hint="Relationship count" />
        <MetricTile label="Team" value={people.length} hint={`${unassignedTasksCount} tasks unassigned`} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Stage Mix</h4>
          <span className="text-xs text-slate-400">{stageBreakdown.length || 0} stages visible</span>
        </div>
        <div className="mt-3 space-y-2">
          {stageBreakdown.length === 0 && <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-400">No active projects yet.</div>}
          {stageBreakdown.map(([stage, count]) => (
            <div key={stage} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 shadow-sm">
              <span className="text-sm font-medium text-slate-700">{stage}</span>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const AttentionUI = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Overdue" value={overdueTasksCount} hint="Past due tasks" />
        <MetricTile label="Due Soon" value={dueSoonTasksCount} hint={`Inside ${DUE_SOON_DAYS} days`} />
        <MetricTile label="Unowned" value={unassignedProjectsCount} hint="Projects missing owners" />
      </div>
      <div className="space-y-3">
        {attentionItems.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-400">Nothing urgent is due in the next {DUE_SOON_DAYS} days.</div>}
        {attentionItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{item.title || 'Untitled Task'}</div>
                <div className="mt-1 text-xs text-slate-500">{item.project?.name || 'Unknown Project'} {item.assignee?.name ? `• ${item.assignee.name}` : '• Unassigned'}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.dueInDays < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{getDueLabel(item.dueInDays)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">{item.project?.priority || 'Unprioritized'} priority</div>
              <button onClick={() => item.project && transitionToWorkspace(onOpenProject, item.project)} disabled={!item.project || !onOpenProject} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">Open Project</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const ActivityUI = () => (
    <div className="space-y-3" role="log" aria-live="polite" aria-label="Recent activity">
      {recentActivity.length > 0 && (
        <div className="flex justify-end mb-2">
          <button type="button" onClick={() => setExpandedModal('activity')}  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 transition-colors">
            <Icons.Maximize /> Expand All ({recentActivity.length})
          </button>
        </div>
      )}

      {recentActivity.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
          No recent notes or communications yet.
        </div>
      )}
      
      {recentActivity.slice(0, 3).map((entry) => (
        <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{entry.type}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{entry.title}</div>
              <div className="mt-1 text-xs text-slate-500">{entry.subtitle}</div>
            </div>
            <time className="text-[10px] text-slate-400" dateTime={entry.timestamp}>{formatDisplayDate(entry.timestamp)}</time>
          </div>
          <p className="mt-3 text-sm leading-relaxed break-words whitespace-pre-wrap text-slate-600">{entry.body || 'No details provided.'}</p>
          {entry.entity && entry.entityType && (
            <div className="mt-3 flex justify-end">
              <button onClick={() => handleActivityEntryOpen(entry)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                {entry.actionLabel}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const TeamPulseUI = () => (
    <div className="space-y-3">
      {teamLoad.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">No team members yet.</div>}
      {teamLoad.map(({ person, ownedProjects, assignedTasks, totalLoad }) => (
        <div key={person.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{person.name?.charAt(0) || '?'}</div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{person.name || 'Unnamed Member'}</div>
              <div className="truncate text-xs text-slate-500">{person.role || 'No role set'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-xs text-slate-500"><div>{ownedProjects} owned projects</div><div>{assignedTasks} assigned tasks</div></div>
            <button onClick={() => transitionToWorkspace(onOpenPerson, person)} disabled={!onOpenPerson} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">{totalLoad} total</button>
          </div>
        </div>
      ))}
    </div>
  );

  const ClientPulseUI = () => (
    <div className="space-y-3">
      {clientPulse.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">No clients yet.</div>}
      {clientPulse.map(({ client, activeProjectCount, urgentTasks, latestCommunication }) => (
        <div key={client.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{client.name || 'Unnamed Client'}</div>
              <div className="mt-1 text-xs text-slate-500">{activeProjectCount} active projects • {urgentTasks} urgent tasks</div>
            </div>
            <button onClick={() => transitionToWorkspace(onOpenClient, client)} disabled={!onOpenClient} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">Open</button>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {latestCommunication ? `Last touch: ${latestCommunication.type} on ${formatDisplayDate(latestCommunication.date)}` : 'No communications logged yet.'}
          </div>
        </div>
      ))}
    </div>
  );

  const QuickActionsUI = () => (
    <div className="space-y-4">
      <button onClick={() => transitionToWorkspace(onCreateProject)} disabled={!onCreateProject} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Create</div><div className="mt-1 text-sm font-semibold text-slate-900">Start a project</div></div>
        <span className="rounded-full bg-indigo-100 p-2 text-indigo-600"><Icons.Folder /></span>
      </button>
      <button onClick={() => transitionToWorkspace(onCreateClient)} disabled={!onCreateClient} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Relationship</div><div className="mt-1 text-sm font-semibold text-slate-900">Add a client</div></div>
        <span className="rounded-full bg-slate-100 p-2 text-slate-700"><Icons.Briefcase /></span>
      </button>
      <button onClick={() => transitionToWorkspace(onCreatePerson)} disabled={!onCreatePerson} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        <div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacity</div><div className="mt-1 text-sm font-semibold text-slate-900">Add a team member</div></div>
        <span className="rounded-full bg-sky-100 p-2 text-sky-700"><Icons.Users /></span>
      </button>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Coverage Signals</h4>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm"><span>Unassigned tasks</span><span className="font-semibold text-slate-900">{unassignedTasksCount}</span></div>
          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm"><span>Projects without owners</span><span className="font-semibold text-slate-900">{unassignedProjectsCount}</span></div>
          <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm"><span>Active client accounts</span><span className="font-semibold text-slate-900">{clientPulse.filter((item) => item.activeProjectCount > 0).length}</span></div>
        </div>
      </div>
    </div>
  );

return (
    <div className={`absolute inset-0 flex flex-col overflow-hidden transition-colors duration-500 ${isEditMode ? 'canvas-grid bg-slate-100' : 'bg-slate-50'}`}>
      
      {/* Unified Header */}
           <div className="flex-none h-14 sm:h-16 w-full flex items-center justify-between border-b border-slate-200/50 bg-white/70 px-4 sm:px-6 shadow-sm backdrop-blur-md z-50">
        <div className="min-w-0">
          <h2 className="text-base sm:text-xl font-semibold tracking-tight text-slate-900 truncate">
            {isEditMode ? 'Editing Dashboard Layout' : 'Dashboard'}
          </h2>
 <p className="text-xs text-slate-500 hidden sm:block">
            {isEditMode ? 'Drag to rearrange and resize cards.' : 'A command center for workload, activity, and client pulse.'}
          </p>
        </div>
        
        {/* Added pr-8 (padding-right) and upgraded the buttons to a bright Indigo color */}
        <div className="flex items-center gap-3 pr-8">
          {isEditMode ? (
            <>
              <button onClick={handleResetLayout} className="rounded-lg border border-slate-200 bg-white px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors hidden sm:block">Reset Layout</button>
              <button onClick={() => setIsEditMode(false)} className="rounded-lg border border-slate-200 bg-white px-3 sm:px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={() => { handleSave(); setIsEditMode(false); }} disabled={isSaving} className="rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                <Icons.Save />
                </button>
            </>
          ) : (
           <button onClick={() => setIsEditMode(true)} className="hidden lg:flex rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-bold text-white shadow-xl hover:bg-indigo-700 items-center gap-2 transition-all hover:scale-105">
            </button>
          )}
        </div>
      </div>

  {/* ── MOBILE: Stacked scrollable layout (below lg) ── */}
      <div className="lg:hidden flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-4 space-y-4 pb-20 sm:pb-4">
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Portfolio Snapshot</h3>
            <OverviewUI />
          </div>
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Quick Actions</h3>
            <QuickActionsUI />
          </div>
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Attention Queue</h3>
            <AttentionUI />
          </div>
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Recent Activity</h3>
            <ActivityUI />
          </div>
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Team Load</h3>
            <TeamPulseUI />
          </div>
          <div className="acrylic rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-2 mb-3 border-b border-slate-200">Client Pulse</h3>
            <ClientPulseUI />
          </div>
        </div>
      </div>
 
      {/* ── DESKTOP: Canvas layout (lg+) ── */}
      <div className="hidden lg:block flex-1 relative w-full overflow-auto custom-scrollbar canvas-scroll-area">
        <div className="relative" style={{ width: '4000px', height: '4000px' }}>
          <DynamicCard isEditable={isEditMode} key={`overview-${layoutVersion}`} id="overview" title="Portfolio Snapshot" defaultLayout={workspaceLayouts.overview} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.overview} onInteract={bringToFront}><OverviewUI /></DynamicCard>
          <DynamicCard isEditable={isEditMode} key={`attention-${layoutVersion}`} id="attention" title="Attention Queue" defaultLayout={workspaceLayouts.attention} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.attention} onInteract={bringToFront}><AttentionUI /></DynamicCard>
          <DynamicCard isEditable={isEditMode} key={`activity-${layoutVersion}`} id="activity" title="Recent Activity" defaultLayout={workspaceLayouts.activity} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.activity} onInteract={bringToFront}><ActivityUI /></DynamicCard>
          <DynamicCard isEditable={isEditMode} key={`team-${layoutVersion}`} id="team" title="Team Load" defaultLayout={workspaceLayouts.team} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.team} onInteract={bringToFront}><TeamPulseUI /></DynamicCard>
          <DynamicCard isEditable={isEditMode} key={`clients-${layoutVersion}`} id="clients" title="Client Pulse" defaultLayout={workspaceLayouts.clients} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.clients} onInteract={bringToFront}><ClientPulseUI /></DynamicCard>
          <DynamicCard isEditable={isEditMode} key={`actions-${layoutVersion}`} id="actions" title="Quick Actions" defaultLayout={workspaceLayouts.actions} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.actions} onInteract={bringToFront}><QuickActionsUI /></DynamicCard>
        </div>
      </div>

      {expandedModal && (
        <>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] transition-opacity duration-300" onClick={() => setExpandedModal(null)} />
          <div className="fixed inset-4 md:inset-12 lg:inset-24 bg-slate-50 rounded-2xl shadow-2xl z-[110] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
              <div><h2 className="text-xl font-bold text-slate-800 capitalize">{expandedModal.replace(/([A-Z])/g, ' $1').trim()} Full History</h2></div>
              <button type="button" onClick={() => setExpandedModal(null)} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><Icons.Close /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="max-w-3xl mx-auto space-y-4">
                {expandedModal === 'activity' && recentActivity.map((entry) => (
                  <div key={entry.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start gap-3 mb-3">
                      <span className="text-xs font-bold text-indigo-600 uppercase bg-indigo-50 px-2.5 py-1 rounded">{entry.type}</span>
                      <time className="text-xs text-slate-500" dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time>
                    </div>
                    <div className="mb-3"><h4 className="font-semibold text-slate-900">{entry.title}</h4><p className="text-xs text-slate-500">{entry.subtitle}</p></div>
                    <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">{entry.body || 'No details provided.'}</p>
                    {entry.entity && entry.entityType && (
                      <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">
                        <button onClick={() => { setExpandedModal(null); handleActivityEntryOpen(entry); }} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">{entry.actionLabel} &rarr;</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )} 
    </div>
  );
};


export { DashboardWorkspace }
