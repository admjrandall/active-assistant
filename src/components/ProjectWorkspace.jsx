import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCRM } from '../context.jsx'
import { Icons } from './Icons.jsx'
import { DynamicCard } from './DynamicCard.jsx'
import { sanitizeInput, debounce } from '../utils.js'
import { MAX_TITLE_LENGTH, MAX_TEXT_LENGTH, CLOSE_ANIMATION_MS, MAX_ZINDEX } from '../config.js'

// ============================================================================
const ALLOWED_TASK_FIELDS = ['title', 'description', 'done', 'assigneeId', 'dueDate', 'effort'];
const ALLOWED_PROJECT_FIELDS = ['name', 'narrative', 'stage', 'priority', 'clientId', 'deptId', 'ownerId', 'startDate', 'dueDate'];
const MAX_NOTES = 1000;
const MAX_TASKS = 1000;
const DEBOUNCE_DELAY = 500;

const PROJECT_MESSAGES = {
  PROJECT_CREATED: "New project created.", 
  PROJECT_SAVED: "Project details saved.", 
  PROJECT_REMOVED: "Project removed.",
  TASK_FAILED: "Failed to add task.", 
  DELETE_TASK_FAILED: "Failed to delete task.", 
  UPDATE_TASK_FAILED: "Failed to update task.",
  SAVE_TASK_FAILED: "Failed to save task change.", 
  SAVE_PROJECT_FAILED: "Failed to save project. Please try again.",
  DELETE_PROJECT_FAILED: "Failed to delete project.", 
  LAYOUT_SAVE_FAILED: "Failed to save layout changes.",
  MAX_NOTES_REACHED: `Maximum of ${MAX_NOTES} notes reached.`, 
  MAX_TASKS_REACHED: `Maximum of ${MAX_TASKS} tasks reached.`,
  CONFIRM_DELETE_PROJECT: "Are you sure you want to permanently delete this project?",
  CONFIRM_CLOSE_UNSAVED: "You have unsaved changes. Are you sure you want to close?", 
  INVALID_DATE_RANGE: "Start date must be before due date.",
};

const validateDateRange = (startDate, dueDate) => {
  if (!startDate || !dueDate) return true;
  return new Date(startDate) <= new Date(dueDate);
};

const ProjectWorkspace = ({ project, onClose, showToast, requestConfirm }) => {
  const { tasks, people, clients, departments, DB, loadAllData } = useCRM();
  const [isOpen, setIsOpen] = useState(false);
  const [isCanvasMode, setIsCanvasMode] = useState(false);
  const [formData, setFormData] = useState({...project});
  const [localTasks, setLocalTasks] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // --- CANVAS INLINE STATES ---
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [newNote, setNewNote] = useState('');

  // --- DRAWER MODAL STATES ---
  const [isTasksExpanded, setIsTasksExpanded] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskFilterType, setTaskFilterType] = useState('All');
  const [taskSortOrder, setTaskSortOrder] = useState('Newest');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskFormData, setTaskFormData] = useState({ title: '', description: '', assigneeId: '', dueDate: '', effort: 0 });

  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteSearchQuery, setNoteSearchQuery] = useState('');
  const [noteSortOrder, setNoteSortOrder] = useState('Newest');
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [noteText, setNoteText] = useState('');

  const [cardZIndexes, setCardZIndexes] = useState({ narrative: 10, tasks: 11, notes: 12, details: 13 });
  const [workspaceLayouts, setWorkspaceLayouts] = useState(project.workspaceLayout || {
    narrative: { x: 50, y: 100, w: 400, h: 300 }, 
    tasks: { x: 480, y: 100, w: 450, h: 500 },
    notes: { x: 50, y: 420, w: 400, h: 300 }, 
    details: { x: 950, y: 100, w: 300, h: 350 }
  });

  const peopleMap = useMemo(() => people.reduce((acc, p) => { acc[p.id] = p; return acc; }, {}), [people]);
  
  const debouncedTaskSave = useMemo(() => debounce((task) => { 
    DB.put('tasks', task).catch(() => showToast(PROJECT_MESSAGES.SAVE_TASK_FAILED)); 
  }, DEBOUNCE_DELAY), [DB, showToast]);

  useEffect(() => { 
    setIsOpen(true); 
    setLocalTasks(tasks.filter(t => t.projectId === project.id)); 
  }, [tasks, project.id]);
  
  const processedTasks = useMemo(() => {
    let result = [...localTasks];
    if (taskFilterType === 'Open') result = result.filter(t => !t.done);
    if (taskFilterType === 'Completed') result = result.filter(t => t.done);
    if (taskSearchQuery.trim() !== '') {
      const query = taskSearchQuery.toLowerCase();
      result = result.filter(t => (t.title || '').toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query));
    }
    result.sort((a, b) => {
       if (taskSortOrder === 'Newest') return b.id.localeCompare(a.id);
       if (taskSortOrder === 'Due Date') {
          if (!a.dueDate) return 1; if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
       }
       return 0;
    });
    return result;
  }, [localTasks, taskFilterType, taskSearchQuery, taskSortOrder]);

  const processedNotes = useMemo(() => {
    let result = [...(formData.notes || [])];
    if (noteSearchQuery.trim() !== '') {
      const query = noteSearchQuery.toLowerCase();
      result = result.filter(n => (n.text || '').toLowerCase().includes(query));
    }
    if (noteSortOrder === 'Oldest') result.reverse();
    return result;
  }, [formData.notes, noteSearchQuery, noteSortOrder]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSaving) {
        if (isTaskModalOpen) setIsTaskModalOpen(false);
        else if (isNoteModalOpen) setIsNoteModalOpen(false);
        else if (isTasksExpanded) setIsTasksExpanded(false);
        else if (isNotesExpanded) setIsNotesExpanded(false);
        else handleClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
    };
    document.addEventListener('keydown', handleKeyDown); 
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, isTaskModalOpen, isNoteModalOpen, isTasksExpanded, isNotesExpanded]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (!ALLOWED_PROJECT_FIELDS.includes(name)) return;
    
    const maxLength = name === 'name' ? MAX_TITLE_LENGTH : MAX_TEXT_LENGTH;
    const sanitizedValue = sanitizeInput(value, maxLength);
    
    if (name === 'startDate' || name === 'dueDate') {
      setFormData(prev => {
        const startDate = name === 'startDate' ? sanitizedValue : prev.startDate;
        const dueDate = name === 'dueDate' ? sanitizedValue : prev.dueDate;
        if (!validateDateRange(startDate, dueDate)) { 
          showToast(PROJECT_MESSAGES.INVALID_DATE_RANGE); 
          return prev; 
        }
        return {...prev, [name]: sanitizedValue};
      });
    } else {
      setFormData(prev => ({...prev, [name]: sanitizedValue}));
    }
  }, [showToast]);

  const bringToFront = useCallback((cardId) => {
    const maxZ = Math.max(...Object.values(cardZIndexes));
    if (maxZ >= MAX_ZINDEX) {
      const sortedCards = Object.entries(cardZIndexes).sort((a, b) => a[1] - b[1]);
      const normalized = {}; sortedCards.forEach(([id], i) => { normalized[id] = 10 + i; });
      normalized[cardId] = 10 + sortedCards.length; setCardZIndexes(normalized);
    } else {
      setCardZIndexes(prev => ({ ...prev, [cardId]: maxZ + 1 }));
    }
  }, [cardZIndexes]);

  const handleLayoutUpdate = async (cardId, newLayout) => {
    const updatedLayouts = { ...workspaceLayouts, [cardId]: newLayout };
    setWorkspaceLayouts(updatedLayouts);
    const updatedProject = { ...formData, workspaceLayout: updatedLayouts };
    try { 
      await DB.put('projects', updatedProject); 
      setFormData(updatedProject); 
    } catch (error) { 
      showToast(PROJECT_MESSAGES.LAYOUT_SAVE_FAILED); 
    }
  };

  const triggerClose = () => { setIsOpen(false); setTimeout(onClose, 400); };
  const handleClose = () => { triggerClose(); };

  const handleSave = async () => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      const isEmpty = !(formData.name || '').trim() && !(formData.narrative || '').trim() && localTasks.length === 0 && (!formData.notes || formData.notes.length === 0);
      if (formData.isNew && isEmpty && !(newNote || '').trim() && !(newTaskTitle || '').trim()) { 
        triggerClose(); 
        return; 
      }

      let finalName = sanitizeInput((formData.name || '').trim(), MAX_TITLE_LENGTH) || 'Unnamed Project';
      const updated = {...formData, name: finalName, lastTouch: new Date().toISOString()}; delete updated.isNew;

      if ((newNote || '').trim()) {
        const currentNotes = updated.notes || [];
        if (currentNotes.length < MAX_NOTES) {
            updated.notes = [{ id: DB.generateId(), text: sanitizeInput(newNote.trim(), MAX_TEXT_LENGTH), date: new Date().toISOString() }, ...currentNotes];
        }
      }

      if ((newTaskTitle || '').trim() && localTasks.length < MAX_TASKS) {
        await DB.put('tasks', { id: DB.generateId(), projectId: project.id, title: sanitizeInput(newTaskTitle.trim(), MAX_TITLE_LENGTH), done: false, subtasks: [], description: '', effort: 0, dueDate: '', assigneeId: '' });
      }

      await DB.put('projects', updated); 
      await loadAllData();
      showToast(formData.isNew ? PROJECT_MESSAGES.PROJECT_CREATED : PROJECT_MESSAGES.PROJECT_SAVED);
      triggerClose();
    } catch (error) { 
      showToast(PROJECT_MESSAGES.SAVE_PROJECT_FAILED); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleProjectDelete = useCallback(() => {
    requestConfirm("Remove Project", PROJECT_MESSAGES.CONFIRM_DELETE_PROJECT, async () => {
      try {
        const projectTasks = tasks.filter(t => t.projectId === project.id);
        for (const task of projectTasks) await DB.delete('tasks', task.id);
        await DB.delete('projects', project.id); 
        await loadAllData();
        showToast(PROJECT_MESSAGES.PROJECT_REMOVED); 
        triggerClose();
      } catch (error) { 
        showToast(PROJECT_MESSAGES.DELETE_PROJECT_FAILED); 
      }
    });
  }, [tasks, project.id, DB, loadAllData, showToast, requestConfirm, triggerClose]);

  const handleTaskChange = useCallback(async (taskId, field, value) => {
    try {
      if (!ALLOWED_TASK_FIELDS.includes(field)) return;
      let sanitizedValue = value;
      if (field === 'title' && typeof value === 'string') sanitizedValue = sanitizeInput(value, MAX_TITLE_LENGTH);
      else if (field === 'description' && typeof value === 'string') sanitizedValue = sanitizeInput(value, MAX_TEXT_LENGTH);
      else if (field === 'effort') { const parsed = parseInt(value, 10); sanitizedValue = isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, 9999); }

      setLocalTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          const updatedTask = {...t, [field]: sanitizedValue};
          if (field === 'title' || field === 'description') debouncedTaskSave(updatedTask);
          else DB.put('tasks', updatedTask).catch(() => showToast(PROJECT_MESSAGES.SAVE_TASK_FAILED));
          return updatedTask;
        }
        return t;
      }));
    } catch (error) { showToast(PROJECT_MESSAGES.UPDATE_TASK_FAILED); }
  }, [debouncedTaskSave, DB, showToast]);

  const handleAddTask = useCallback(async (e) => {
    if (e.key === 'Enter' && newTaskTitle.trim()) {
      e.preventDefault();
      if (localTasks.length >= MAX_TASKS) { showToast(PROJECT_MESSAGES.MAX_TASKS_REACHED); return; }
      try {
        const sanitizedTitle = sanitizeInput(newTaskTitle.trim(), MAX_TITLE_LENGTH);
        const t = { id: DB.generateId(), projectId: project.id, title: sanitizedTitle, done: false, subtasks: [], description: '', effort: 0, dueDate: '', assigneeId: '' };
        await DB.put('tasks', t); 
        setLocalTasks(prev => [...prev, t]); 
        setNewTaskTitle('');
      } catch (error) { showToast(PROJECT_MESSAGES.TASK_FAILED); }
    }
  }, [newTaskTitle, localTasks.length, project.id, DB, showToast]);

  const handleAddNote = useCallback(() => {
    if (!newNote.trim()) return;
    const sanitizedText = sanitizeInput(newNote.trim(), MAX_TEXT_LENGTH);
    setFormData(prev => {
      const currentNotes = prev.notes || [];
      if (currentNotes.length >= MAX_NOTES) { showToast(PROJECT_MESSAGES.MAX_NOTES_REACHED); return prev; }
      return { ...prev, notes: [{ id: DB.generateId(), text: sanitizedText, date: new Date().toISOString() }, ...currentNotes] };
    });
    setNewNote('');
  }, [newNote, DB, showToast]);

  const handleUpdateNote = useCallback((noteId, newText) => {
    const sanitizedText = sanitizeInput(newText, MAX_TEXT_LENGTH);
    setFormData(prev => ({ ...prev, notes: (prev.notes || []).map(n => n.id === noteId ? { ...n, text: sanitizedText } : n) }));
  }, []);

  const handleToggleTask = async (task) => {
     const updatedTask = { ...task, done: !task.done };
     try { 
       await DB.put('tasks', updatedTask); 
       setLocalTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t)); 
     } catch (error) { 
       showToast(PROJECT_MESSAGES.UPDATE_TASK_FAILED); 
     }
  };

  const handleTaskDelete = async (id) => {
    try { 
      await DB.delete('tasks', id); 
      setLocalTasks(prev => prev.filter(t => t.id !== id)); 
    } catch (error) { 
      showToast(PROJECT_MESSAGES.DELETE_TASK_FAILED); 
    }
  };

  const handleDeleteNote = (noteId) => {
    setFormData(prev => ({ ...prev, notes: (prev.notes || []).filter(n => n.id !== noteId) }));
  };

  const openTaskModal = (task = null) => {
    if (task) { 
      setEditingTaskId(task.id); 
      setTaskFormData({ title: task.title || '', description: task.description || '', assigneeId: task.assigneeId || '', dueDate: task.dueDate || '', effort: task.effort || 0 }); 
    } else { 
      setEditingTaskId(null); 
      setTaskFormData({ title: '', description: '', assigneeId: '', dueDate: '', effort: 0 }); 
    }
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!taskFormData.title.trim()) return;
    if (localTasks.length >= MAX_TASKS && !editingTaskId) { showToast(PROJECT_MESSAGES.MAX_TASKS_REACHED); return; }
    try {
      const taskToSave = editingTaskId 
         ? { ...localTasks.find(t => t.id === editingTaskId), ...taskFormData, title: sanitizeInput(taskFormData.title, MAX_TITLE_LENGTH), description: sanitizeInput(taskFormData.description, MAX_TEXT_LENGTH) }
         : { id: DB.generateId(), projectId: project.id, done: false, subtasks: [], ...taskFormData, title: sanitizeInput(taskFormData.title, MAX_TITLE_LENGTH), description: sanitizeInput(taskFormData.description, MAX_TEXT_LENGTH) };
      await DB.put('tasks', taskToSave);
      setLocalTasks(prev => editingTaskId ? prev.map(t => t.id === editingTaskId ? taskToSave : t) : [taskToSave, ...prev]);
      setIsTaskModalOpen(false);
    } catch (error) { showToast(PROJECT_MESSAGES.SAVE_TASK_FAILED); }
  };

  const openNoteModal = (note = null) => {
    if (note) { 
      setEditingNoteId(note.id); 
      setNoteText(note.text || ''); 
    } else { 
      setEditingNoteId(null); 
      setNoteText(''); 
    }
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = () => {
    if (!noteText.trim()) return;
    const sanitizedText = sanitizeInput(noteText.trim(), MAX_TEXT_LENGTH);
    setFormData(prev => {
      const currentNotes = prev.notes || [];
      if (currentNotes.length >= MAX_NOTES && !editingNoteId) { showToast(PROJECT_MESSAGES.MAX_NOTES_REACHED); return prev; }
      const updatedNotes = editingNoteId
         ? currentNotes.map(n => n.id === editingNoteId ? { ...n, text: sanitizedText } : n)
         : [{ id: DB.generateId(), text: sanitizedText, date: new Date().toISOString() }, ...currentNotes];
      return { ...prev, notes: updatedNotes };
    });
    setIsNoteModalOpen(false);
  };

  // --- UI RENDER FUNCTIONS ---
  // Using functions instead of Components prevents React from unmounting inputs on every keystroke

  const renderDrawerDetails = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stage</label>
        <select name="stage" value={formData.stage || 'Lead'} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm">
          <option value="Lead">Lead Phase</option>
          <option value="Active">Active Build</option>
          <option value="Review">In Review</option>
          <option value="Done">Completed</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Priority</label>
        <select name="priority" value={formData.priority || 'Medium'} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm">
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Client</label>
        <select name="clientId" value={formData.clientId || ''} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm">
          <option value="">No Client Linked</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Department</label>
        <select name="deptId" value={formData.deptId || ''} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm">
          <option value="">No Dept Linked</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Owner</label>
        <select name="ownerId" value={formData.ownerId || ''} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm">
          <option value="">Unassigned</option>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Start Date</label>
        <input type="date" name="startDate" value={formData.startDate || ''} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Due Date</label>
        <input type="date" name="dueDate" value={formData.dueDate || ''} onChange={handleChange} className="fluent-input w-full p-2 rounded-lg text-sm text-rose-600 font-medium" />
      </div>
    </div>
  );

  const CanvasTaskListUI = useMemo(() => (
    <div className="space-y-2">
      {localTasks.map(task => {
        const isExpanded = expandedTaskId === task.id;
        const assigneeName = task.assigneeId && peopleMap[task.assigneeId]?.name;
        return (
          <div key={task.id} className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all">
            <div className="flex items-start gap-3 p-3 hover:bg-slate-50 group min-w-0">
              <button onClick={() => handleToggleTask(task)} className={`w-5 h-5 flex-shrink-0 rounded-md border flex items-center justify-center transition-colors mt-0.5 ${task.done ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 bg-white hover:border-indigo-400'}`}>
                {task.done && <Icons.Check />}
              </button>
              <textarea 
                value={task.title || ''} 
                onChange={e => handleTaskChange(task.id, 'title', e.target.value)} 
                maxLength={MAX_TITLE_LENGTH} 
                rows={1} 
                className={`flex-1 min-w-0 text-sm bg-transparent focus:outline-none resize-none overflow-hidden ${task.done ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`} 
                style={{ fieldSizing: 'content' }} 
              />
              <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                {task.assigneeId && !isExpanded && (
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-[10px] flex items-center justify-center font-bold" title={assigneeName}>
                    {assigneeName?.charAt(0) || '?'}
                  </span>
                )}
                <button onClick={() => setExpandedTaskId(isExpanded ? null : task.id)} className="p-1 text-slate-400 hover:text-indigo-600 bg-slate-100 rounded transition-colors">
                  {isExpanded ? <Icons.ChevronUp /> : <Icons.ChevronDown />}
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="bg-indigo-50/30 p-4 border-t border-slate-100 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Assignee</label>
                    <select value={task.assigneeId || ''} onChange={e => handleTaskChange(task.id, 'assigneeId', e.target.value)} className="fluent-input w-full text-xs p-1.5 rounded">
                      <option value="">Unassigned</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Due Date</label>
                    <input type="date" value={task.dueDate || ''} onChange={e => handleTaskChange(task.id, 'dueDate', e.target.value)} className="fluent-input w-full text-xs p-1.5 rounded" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Est. Effort (Pts)</label>
                    <input type="number" min="0" value={task.effort || 0} onChange={e => handleTaskChange(task.id, 'effort', parseInt(e.target.value, 10))} className="fluent-input w-full text-xs p-1.5 rounded" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Task Description</label>
                  <textarea value={task.description || ''} onChange={e => handleTaskChange(task.id, 'description', e.target.value)} maxLength={MAX_TEXT_LENGTH} placeholder="Add details, links, or sub-notes here..." className="fluent-input w-full text-xs p-2 rounded min-h-[60px]" />
                </div>
                <div className="flex justify-end">
                  <button onClick={() => handleTaskDelete(task.id)} className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1 hover:underline">
                    <Icons.Trash /> Delete Task
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-dashed border-slate-300">
        <div className="w-5 h-5 flex items-center justify-center text-slate-400"><Icons.Plus /></div>
        <input type="text" placeholder="Add new task and press Enter..." value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={handleAddTask} maxLength={MAX_TITLE_LENGTH} className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
      </div>
    </div>
  ), [localTasks, newTaskTitle, expandedTaskId, peopleMap, people, handleTaskChange, handleToggleTask, handleAddTask, handleTaskDelete]);

  const CanvasNotesUI = useMemo(() => (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-col gap-2">
        <textarea 
          value={newNote} 
          onChange={e => setNewNote(e.target.value)} 
          placeholder="Add a new project note..." 
          maxLength={MAX_TEXT_LENGTH} 
          className="fluent-input w-full p-2 rounded-lg text-sm resize-y min-h-[60px]" 
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote(); }} 
        />
        <button onClick={handleAddNote} disabled={!newNote.trim()} className="self-end bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Add Note</button>
      </div>
      <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 bg-slate-50 p-3 rounded-xl inner-shadow min-h-[150px]">
        {(!formData.notes || formData.notes.length === 0) && <div className="text-sm text-slate-400 text-center p-4">No notes added yet.</div>}
        {(formData.notes || []).map(n => (
          <div key={n.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm group">
            <div className="flex items-center justify-between mb-1">
              <time className="text-[10px] font-bold text-slate-400">{new Date(n.date).toLocaleString()}</time>
              <button onClick={() => handleDeleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 text-xs hover:text-rose-600 transition-opacity"><Icons.Trash /></button>
            </div>
            <textarea value={n.text} onChange={e => handleUpdateNote(n.id, e.target.value)} maxLength={MAX_TEXT_LENGTH} className="w-full text-sm text-slate-700 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-indigo-200 rounded p-1 resize-y min-h-[40px]" />
          </div>
        ))}
      </div>
    </div>
  ), [newNote, formData.notes, handleAddNote, handleUpdateNote, handleDeleteNote]);

  return (
    <>
      <div className={`fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={handleClose} />
      
      {isCanvasMode ? (
        <div className={`fixed inset-0 z-50 canvas-grid transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'} bg-slate-100`}>
          <div className="absolute top-0 w-full h-16 acrylic border-b border-slate-200/50 flex items-center justify-between px-4 md:px-8 z-50 shadow-sm overflow-hidden">
            <input name="name" value={formData.name || ''} onChange={handleChange} placeholder="Enter Project Name" maxLength={MAX_TITLE_LENGTH} className="text-lg md:text-2xl font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none transition-colors w-1/3 min-w-0 flex-shrink" />
            <div className="flex gap-3 items-center">
              <button onClick={() => setIsCanvasMode(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm flex items-center gap-2"><Icons.Grid /> Exit Canvas</button>
              <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50">{isSaving ? 'Saving...' : 'Save & Close'}</button>
            </div>
          </div>
          <div className="relative w-full h-full pt-16 overflow-y-auto overflow-x-hidden">
            <div className="relative w-full" style={{ minHeight: '2000px' }}>
              <DynamicCard id="narrative" title="Narrative" defaultLayout={workspaceLayouts.narrative} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.narrative} onInteract={bringToFront}>
                <textarea name="narrative" value={formData.narrative || ''} onChange={handleChange} maxLength={MAX_TEXT_LENGTH} className="w-full h-full p-2 bg-transparent focus:outline-none resize-none text-sm text-slate-700 leading-relaxed" placeholder="Record overarching project goals, details, and context here..." />
              </DynamicCard>
              
              <DynamicCard id="tasks" title="Task Management" defaultLayout={workspaceLayouts.tasks} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.tasks} onInteract={bringToFront}>
                 {CanvasTaskListUI}
              </DynamicCard>
              
              <DynamicCard id="notes" title="Notes" defaultLayout={workspaceLayouts.notes} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.notes} onInteract={bringToFront}>
                 {CanvasNotesUI}
              </DynamicCard>
              
              <DynamicCard id="details" title="Details & Routing" defaultLayout={workspaceLayouts.details} onUpdate={handleLayoutUpdate} zIndex={cardZIndexes.details} onInteract={bringToFront}>
                 {renderDrawerDetails()}
              </DynamicCard>
            </div>
          </div>
        </div>
      ) : (
        <div className={`fixed top-0 right-0 h-full w-full md:w-[600px] max-w-[95vw] acrylic-dark transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true" aria-busy={isSaving}>
          <div className="flex flex-col h-full bg-white/95 md:rounded-l-2xl">
            
            <div className="px-4 md:px-8 py-4 md:py-6 border-b border-slate-200/50 flex justify-between items-center gap-4">
              <input name="name" value={formData.name || ''} onChange={handleChange} placeholder="Enter Project Name" maxLength={MAX_TITLE_LENGTH} className="text-2xl font-bold bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none w-full" />
              <div className="flex items-center gap-2">
                <button onClick={() => setIsCanvasMode(true)} className="hidden md:flex p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors" title="Spatial Canvas"><Icons.Maximize /></button>
                <button onClick={handleClose} disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 disabled:opacity-50 transition-colors"><Icons.Close /></button>
              </div>
            </div>

            <div className="p-4 sm:p-8 flex-1 overflow-y-auto flex flex-col gap-4 custom-scrollbar bg-slate-50/50">
              
              <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-1">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Icons.FileText size={16} className="text-indigo-500" /> 
                    Project Narrative
                  </h3>
                </div>
                <textarea 
                  name="narrative" 
                  value={formData.narrative || ''} 
                  onChange={handleChange} 
                  placeholder="Record overarching project goals, details, and context here..." 
                  maxLength={MAX_TEXT_LENGTH} 
                  className="w-full min-h-[40px] bg-transparent text-sm resize-y leading-relaxed text-slate-700 focus:outline-none placeholder:text-slate-400" 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div 
                  onClick={() => setIsTasksExpanded(true)}
                  className="bg-white border border-slate-200/70 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer relative group"
                >
                  <div className="absolute top-4 right-4 text-slate-300 group-hover:text-indigo-500 transition-colors">
                    <Icons.Maximize size={16} />
                  </div>
                  <div className="flex items-center gap-3 pr-10">
                    <div className="p-2 bg-indigo-50/80 text-indigo-600 rounded-lg">
                      <Icons.Check size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Task Management</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-medium">{localTasks.length} Logged</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openTaskModal(); }}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                          title="Quick Add Task"
                        >
                          <Icons.Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => setIsNotesExpanded(true)}
                  className="bg-white border border-slate-200/70 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-amber-300 transition-all cursor-pointer relative group"
                >
                  <div className="absolute top-4 right-4 text-slate-300 group-hover:text-amber-500 transition-colors">
                    <Icons.Maximize size={16} />
                  </div>
                  <div className="flex items-center gap-3 pr-10">
                    <div className="p-2 bg-amber-50/80 text-amber-600 rounded-lg">
                      <Icons.FileText size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Project Notes</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500 font-medium">{(formData.notes || []).length} Total</span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); openNoteModal(); }}
                          className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-amber-600 hover:text-white transition-all shadow-sm"
                          title="Quick Add Note"
                        >
                          <Icons.Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <Icons.Settings size={16} className="text-slate-500" /> 
                    Details & Routing
                  </h3>
                </div>
                {renderDrawerDetails()}
              </div>
            </div>

            <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3 md:rounded-bl-2xl">
              <button type="button" onClick={handleProjectDelete} disabled={isSaving} className="text-rose-500 hover:text-rose-600 text-sm font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
                <Icons.Trash /> Remove Project
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-2.5 rounded-lg text-sm font-medium shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving ? 'Saving...' : 'Save & Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Level 1 Modal: Expanded Tasks */}
      {isTasksExpanded && (
        <>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] transition-opacity duration-300" onClick={() => setIsTasksExpanded(false)} />
          <div className="fixed inset-4 md:inset-8 lg:inset-x-32 lg:inset-y-12 bg-white rounded-2xl shadow-2xl z-[70] flex flex-col overflow-hidden modal-enter">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Task Management</h2>
                <p className="text-sm text-slate-500">{formData.name || 'Project'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openTaskModal()} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors">
                  <Icons.Plus /> Add Task
                </button>
                <button type="button" onClick={() => setIsTasksExpanded(false)} className="p-2 rounded-full hover:bg-slate-200 text-slate-500">
                  <Icons.Close />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
              <div className="mx-auto max-w-4xl space-y-4">
                
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex-1 w-full relative">
                    <input type="text" placeholder="Search tasks..." value={taskSearchQuery} onChange={(e) => setTaskSearchQuery(e.target.value)} className="fluent-input w-full pl-3 pr-4 py-2 rounded-lg text-sm" />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select value={taskFilterType} onChange={(e) => setTaskFilterType(e.target.value)} className="fluent-input text-sm p-2 rounded-lg border-slate-200 flex-1 sm:flex-none">
                      <option value="All">All Tasks</option>
                      <option value="Open">Open</option>
                      <option value="Completed">Completed</option>
                    </select>
                    <select value={taskSortOrder} onChange={(e) => setTaskSortOrder(e.target.value)} className="fluent-input text-sm p-2 rounded-lg border-slate-200 flex-1 sm:flex-none">
                      <option value="Newest">Newest First</option>
                      <option value="Due Date">Due Date</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {processedTasks.length === 0 && <div className="text-sm text-slate-400 text-center py-12 bg-white border border-slate-200 border-dashed rounded-xl">No tasks found.</div>}
                  {processedTasks.map((task) => (
                    <div key={task.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group flex items-start gap-4">
                      <button onClick={() => handleToggleTask(task)} className={`w-5 h-5 mt-1 flex-shrink-0 rounded-md border flex items-center justify-center transition-colors ${task.done ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-slate-300 bg-slate-50 hover:border-indigo-400'}`}>
                        {task.done && <Icons.Check />}
                      </button>
                      <div className="flex-1 min-w-0">
                         <div className={`text-base font-semibold ${task.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</div>
                         {task.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>}
                         <div className="flex items-center gap-3 mt-3">
                           {task.dueDate && <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-1 rounded">Due: {task.dueDate}</span>}
                           {task.assigneeId && <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{peopleMap[task.assigneeId]?.name || 'Unknown'}</span>}
                           {task.effort > 0 && <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-1 rounded">Effort: {task.effort}</span>}
                         </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => openTaskModal(task)} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg"><Icons.Edit /></button>
                         <button onClick={() => handleTaskDelete(task.id)} className="p-2 text-rose-400 hover:text-rose-600 bg-rose-50 rounded-lg"><Icons.Trash /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Level 2 Modal: Add/Edit Task */}
      {isTaskModalOpen && (
         <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsTaskModalOpen(false)} />
           <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl z-[90] flex flex-col overflow-hidden modal-enter">
             <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
               <h2 className="text-lg font-bold text-slate-800">{editingTaskId ? 'Edit Task' : 'Add New Task'}</h2>
               <button type="button" onClick={() => setIsTaskModalOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><Icons.Close /></button>
             </div>
             <div className="p-6 flex flex-col gap-4 custom-scrollbar overflow-y-auto max-h-[70vh]">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Task Title</label>
                  <input type="text" value={taskFormData.title} onChange={e => setTaskFormData(prev => ({...prev, title: e.target.value}))} maxLength={MAX_TITLE_LENGTH} className="fluent-input w-full p-2.5 rounded-lg text-sm" placeholder="What needs to be done?" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Assignee</label>
                    <select value={taskFormData.assigneeId} onChange={e => setTaskFormData(prev => ({...prev, assigneeId: e.target.value}))} className="fluent-input w-full p-2.5 rounded-lg text-sm">
                      <option value="">Unassigned</option>
                      {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Due Date</label>
                    <input type="date" value={taskFormData.dueDate} onChange={e => setTaskFormData(prev => ({...prev, dueDate: e.target.value}))} className="fluent-input w-full p-2.5 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Effort (Pts)</label>
                    <input type="number" min="0" value={taskFormData.effort} onChange={e => setTaskFormData(prev => ({...prev, effort: parseInt(e.target.value, 10) || 0}))} className="fluent-input w-full p-2.5 rounded-lg text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Description</label>
                  <textarea value={taskFormData.description} onChange={e => setTaskFormData(prev => ({...prev, description: e.target.value}))} placeholder="Add details, links, or context..." maxLength={MAX_TEXT_LENGTH} className="fluent-input w-full p-3 rounded-lg text-sm resize-y min-h-[120px]" />
                </div>
             </div>
             <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
               <button type="button" onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
               <button type="button" onClick={handleSaveTask} disabled={!taskFormData.title.trim()} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">Save Task</button>
             </div>
           </div>
         </div>
      )}

      {/* Level 1 Modal: Expanded Notes */}
      {isNotesExpanded && (
        <>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] transition-opacity duration-300" onClick={() => setIsNotesExpanded(false)} />
          <div className="fixed inset-4 md:inset-8 lg:inset-x-32 lg:inset-y-12 bg-white rounded-2xl shadow-2xl z-[70] flex flex-col overflow-hidden modal-enter">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Project Notes</h2>
                <p className="text-sm text-slate-500">{formData.name || 'Project'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openNoteModal()} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors">
                  <Icons.Plus /> Add Note
                </button>
                <button type="button" onClick={() => setIsNotesExpanded(false)} className="p-2 rounded-full hover:bg-slate-200 text-slate-500">
                  <Icons.Close />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
              <div className="mx-auto max-w-4xl space-y-4">
                
                <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex-1 w-full relative">
                    <input type="text" placeholder="Search notes..." value={noteSearchQuery} onChange={(e) => setNoteSearchQuery(e.target.value)} className="fluent-input w-full pl-3 pr-4 py-2 rounded-lg text-sm" />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select value={noteSortOrder} onChange={(e) => setNoteSortOrder(e.target.value)} className="fluent-input text-sm p-2 rounded-lg border-slate-200 flex-1 sm:flex-none">
                      <option value="Newest">Newest First</option>
                      <option value="Oldest">Oldest First</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {processedNotes.length === 0 && <div className="text-sm text-slate-400 text-center py-12 bg-white border border-slate-200 border-dashed rounded-xl">No notes found.</div>}
                  {processedNotes.map((note) => (
                    <div key={note.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative">
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <time className="text-xs font-bold text-slate-400" dateTime={note.date}>{new Date(note.date).toLocaleString()}</time>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openNoteModal(note)} className="p-1.5 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded"><Icons.Edit /></button>
                          <button onClick={() => handleDeleteNote(note.id)} className="p-1.5 text-rose-400 hover:text-rose-600 bg-rose-50 rounded"><Icons.Trash /></button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{note.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Level 2 Modal: Add/Edit Note */}
      {isNoteModalOpen && (
         <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsNoteModalOpen(false)} />
           <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl z-[90] flex flex-col overflow-hidden modal-enter">
             <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
               <h2 className="text-lg font-bold text-slate-800">{editingNoteId ? 'Edit Note' : 'Log Project Note'}</h2>
               <button type="button" onClick={() => setIsNoteModalOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><Icons.Close /></button>
             </div>
             <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Note Details</label>
                  <textarea value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveNote(); }} placeholder="Enter note... (Ctrl+Enter to save)" maxLength={MAX_TEXT_LENGTH} className="fluent-input w-full p-3 rounded-lg text-sm resize-y min-h-[150px]" />
                </div>
             </div>
             <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
               <button type="button" onClick={() => setIsNoteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
               <button type="button" onClick={handleSaveNote} disabled={!noteText.trim()} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">Save Note</button>
             </div>
           </div>
         </div>
      )}
    </>
  );
};

export { ProjectWorkspace }