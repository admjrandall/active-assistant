import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useCRM } from '../context.jsx'
import { Icons } from './Icons.jsx'
import { sanitizeInput } from '../utils.js'
import { MAX_TITLE_LENGTH, MAX_TEXT_LENGTH, CLOSE_ANIMATION_MS } from '../config.js'

const ALLOWED_CLIENT_FIELDS = ['name', 'contactName', 'email', 'phone'];
const ALLOWED_COMM_TYPES = ['Email', 'Call', 'Meeting', 'Note'];
const DEFAULT_COMM_TYPE = ALLOWED_COMM_TYPES[0];
const MAX_COMMUNICATIONS = 1000;

const CLIENT_MESSAGES = {
  CLIENT_CREATED: 'New client created.',
  CLIENT_SAVED: 'Client updated.',
  CLIENT_REMOVED: 'Client removed.',
  SAVE_CLIENT_FAILED: 'Failed to save client. Please try again.',
  SAVE_COMMUNICATION_FAILED: 'Failed to save communication.',
  DELETE_CLIENT_FAILED: 'Failed to delete client.',
  INVALID_COMMUNICATION_TYPE: 'Invalid communication type selected.',
  MAX_COMMUNICATIONS_REACHED: `Maximum of ${MAX_COMMUNICATIONS} communications reached.`,
  CONFIRM_CLOSE_UNSAVED: 'You have unsaved changes. Are you sure you want to close?',
  CONFIRM_DELETE_CLIENT: 'Are you sure you want to remove this client? Related communications will be deleted and linked projects will be unassigned.',
  CONFIRM_DISCARD_CLIENT: 'Discard this unsaved client draft?',
};

const createEditableClientState = (client) => ({
  name: sanitizeInput(client?.name || '', MAX_TITLE_LENGTH),
  contactName: sanitizeInput(client?.contactName || '', MAX_TITLE_LENGTH),
  email: sanitizeInput(client?.email || '', MAX_TITLE_LENGTH),
  phone: sanitizeInput(client?.phone || '', MAX_TITLE_LENGTH),
});

const normalizeClientField = (value) => sanitizeInput((value || '').trim(), MAX_TITLE_LENGTH);
const normalizeCommunicationNotes = (value) => sanitizeInput((value || '').trim(), MAX_TEXT_LENGTH);

const normalizeClientFields = (clientData) => {
  return ALLOWED_CLIENT_FIELDS.reduce((acc, field) => {
    acc[field] = normalizeClientField(clientData?.[field]);
    return acc;
  }, {});
};

const hasClientFieldChanges = (originalFields, currentFields) => {
  return ALLOWED_CLIENT_FIELDS.some((field) => originalFields[field] !== currentFields[field]);
};

const sortCommunicationsByDate = (records) => {
  return [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
};

const buildClientRecord = (sourceClient, editedFields) => ({
  id: sourceClient.id,
  name: normalizeClientField(editedFields.name) || 'Unnamed Client',
  contactName: normalizeClientField(editedFields.contactName),
  email: normalizeClientField(editedFields.email),
  phone: normalizeClientField(editedFields.phone),
  notes: typeof sourceClient?.notes === 'string'
    ? sanitizeInput(sourceClient.notes, MAX_TEXT_LENGTH)
    : sourceClient?.notes || '',
  x: typeof sourceClient?.x === 'number' ? sourceClient.x : 0,
  y: typeof sourceClient?.y === 'number' ? sourceClient.y : 0,
});

const isValidCommunicationType = (type) => ALLOWED_COMM_TYPES.includes(type);

const ClientWorkspace = ({ client, onClose, showToast, requestConfirm }) => {
  const { communications, projects, DB, loadAllData } = useCRM();

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState(() => createEditableClientState(client));
  const [newCommText, setNewCommText] = useState('');
  const [newCommType, setNewCommType] = useState(DEFAULT_COMM_TYPE);
  
  // Modal States
  const [isCommHistoryExpanded, setIsCommHistoryExpanded] = useState(false);
  const [isAddCommModalOpen, setIsAddCommModalOpen] = useState(false);

  // Search, Filter, and Sort States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [sortOrder, setSortOrder] = useState('Newest');

  const localComms = useMemo(() => {
    return sortCommunicationsByDate(
      communications.filter((communication) => communication.clientId === client.id)
    );
  }, [communications, client.id]);

  const processedComms = useMemo(() => {
    let result = [...localComms];

    if (filterType !== 'All') {
      result = result.filter(c => c.type === filterType);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.notes.toLowerCase().includes(query) || 
        c.type.toLowerCase().includes(query)
      );
    }

    if (sortOrder === 'Oldest') {
      result = result.reverse();
    }

    return result;
  }, [localComms, filterType, searchQuery, sortOrder]);

  const relatedProjects = useMemo(() => {
    return projects.filter((project) => project.clientId === client.id);
  }, [projects, client.id]);

  const initialClientFields = useMemo(() => normalizeClientFields(client), [client]);
  const currentClientFields = useMemo(() => normalizeClientFields(formData), [formData]);
  const hasCommDraft = useMemo(() => Boolean(normalizeCommunicationNotes(newCommText)), [newCommText]);
  const hasUnsavedChanges = useMemo(() => {
    return hasClientFieldChanges(initialClientFields, currentClientFields) || hasCommDraft;
  }, [initialClientFields, currentClientFields, hasCommDraft]);

  useEffect(() => {
    setIsOpen(true);
    setIsSaving(false);
    setFormData(createEditableClientState(client));
    setNewCommText('');
    setNewCommType(DEFAULT_COMM_TYPE);
    
    setSearchQuery('');
    setFilterType('All');
    setSortOrder('Newest');
  }, [client]);

  const triggerClose = useCallback(() => {
    setIsOpen(false);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }, [onClose]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    if (!ALLOWED_CLIENT_FIELDS.includes(name)) return;
    setFormData((prev) => ({ ...prev, [name]: sanitizeInput(value, MAX_TITLE_LENGTH) }));
  }, []);

  const handleCommTypeChange = useCallback((e) => {
    const { value } = e.target;
    if (!isValidCommunicationType(value)) return;
    setNewCommType(value);
  }, []);

  const handleCommTextChange = useCallback((e) => {
    setNewCommText(sanitizeInput(e.target.value, MAX_TEXT_LENGTH));
  }, []);

  const createPendingCommunication = useCallback(() => {
    const notes = normalizeCommunicationNotes(newCommText);
    if (!notes) return null;
    if (!isValidCommunicationType(newCommType)) {
      showToast(CLIENT_MESSAGES.INVALID_COMMUNICATION_TYPE);
      return null;
    }
    if (localComms.length >= MAX_COMMUNICATIONS) {
      showToast(CLIENT_MESSAGES.MAX_COMMUNICATIONS_REACHED);
      return null;
    }
    return { id: DB.generateId(), clientId: client.id, date: new Date().toISOString(), type: newCommType, notes };
  }, [DB, client.id, localComms.length, newCommText, newCommType, showToast]);

  const handleClose = useCallback(() => {
    if (!hasUnsavedChanges) {
      triggerClose();
      return;
    }
    requestConfirm('Close Without Saving?', CLIENT_MESSAGES.CONFIRM_CLOSE_UNSAVED, triggerClose);
  }, [hasUnsavedChanges, requestConfirm, triggerClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    if (!hasUnsavedChanges) {
      triggerClose();
      return;
    }

    const pendingCommunication = createPendingCommunication();
    if (hasCommDraft && !pendingCommunication && !isAddCommModalOpen) return;

    try {
      setIsSaving(true);
      const clientRecord = buildClientRecord(client, formData);
      await DB.put('clients', clientRecord);
      if (pendingCommunication) {
        await DB.put('communications', pendingCommunication);
      }
      await loadAllData();
      showToast(client.isNew ? CLIENT_MESSAGES.CLIENT_CREATED : CLIENT_MESSAGES.CLIENT_SAVED);
      triggerClose();
    } catch (error) {
      showToast(CLIENT_MESSAGES.SAVE_CLIENT_FAILED);
    } finally {
      setIsSaving(false);
    }
  }, [DB, client, createPendingCommunication, formData, hasCommDraft, hasUnsavedChanges, isSaving, loadAllData, showToast, triggerClose, isAddCommModalOpen]);

  const handleAddComm = useCallback(async () => {
    if (isSaving) return;
    const pendingCommunication = createPendingCommunication();
    if (!pendingCommunication) return;

    try {
      setIsSaving(true);
      await DB.put('communications', pendingCommunication);
      setNewCommText('');
      setIsAddCommModalOpen(false);
      await loadAllData();
    } catch (error) {
      showToast(CLIENT_MESSAGES.SAVE_COMMUNICATION_FAILED);
    } finally {
      setIsSaving(false);
    }
  }, [DB, createPendingCommunication, isSaving, loadAllData, showToast]);

  const handleUpdateComm = useCallback(async (commId, newNotes) => {
    const sanitizedNotes = sanitizeInput(newNotes, MAX_TEXT_LENGTH);
    const communication = communications.find(c => c.id === commId);
    if (!communication) return;
    try {
      await DB.put('communications', { ...communication, notes: sanitizedNotes });
      await loadAllData();
    } catch (error) {
      showToast(CLIENT_MESSAGES.SAVE_COMMUNICATION_FAILED);
    }
  }, [DB, communications, loadAllData, showToast]);

  const handleDeleteComm = useCallback(async (commId) => {
    try {
      await DB.delete('communications', commId);
      await loadAllData();
    } catch (error) {
      showToast('Failed to delete communication.');
    }
  }, [DB, loadAllData, showToast]);

  const handleCommInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAddComm();
    }
  }, [handleAddComm]);

  const handleDelete = useCallback(() => {
    if (client.isNew) {
      requestConfirm('Discard Client', CLIENT_MESSAGES.CONFIRM_DISCARD_CLIENT, triggerClose);
      return;
    }

    requestConfirm('Remove Client', CLIENT_MESSAGES.CONFIRM_DELETE_CLIENT, async () => {
      try {
        setIsSaving(true);
        for (const communication of localComms) {
          await DB.delete('communications', communication.id);
        }
        for (const project of relatedProjects) {
          await DB.put('projects', { ...project, clientId: '' });
        }
        await DB.delete('clients', client.id);
        await loadAllData();
        showToast(CLIENT_MESSAGES.CLIENT_REMOVED);
        triggerClose();
      } catch (error) {
        showToast(CLIENT_MESSAGES.DELETE_CLIENT_FAILED);
      } finally {
        setIsSaving(false);
      }
    });
  }, [DB, client.id, client.isNew, loadAllData, localComms, relatedProjects, requestConfirm, showToast, triggerClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSaving) {
        if (isAddCommModalOpen) setIsAddCommModalOpen(false);
        else if (isCommHistoryExpanded) setIsCommHistoryExpanded(false);
        else handleClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, handleSave, isSaving, isAddCommModalOpen, isCommHistoryExpanded]);

  // --- UI RENDER FUNCTIONS ---
  
  const renderContactFields = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label htmlFor="client-contact-name" className="text-xs font-bold text-slate-500 uppercase block mb-1">Primary Contact</label>
        <input id="client-contact-name" name="contactName" value={formData.contactName} onChange={handleChange} maxLength={MAX_TITLE_LENGTH} autoComplete="name" className="fluent-input w-full p-2 rounded-lg text-sm" />
      </div>
      <div>
        <label htmlFor="client-phone" className="text-xs font-bold text-slate-500 uppercase block mb-1">Phone</label>
        <input id="client-phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} maxLength={MAX_TITLE_LENGTH} autoComplete="tel" className="fluent-input w-full p-2 rounded-lg text-sm" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="client-email" className="text-xs font-bold text-slate-500 uppercase block mb-1">Email</label>
        <input id="client-email" name="email" type="email" value={formData.email} onChange={handleChange} maxLength={MAX_TITLE_LENGTH} autoComplete="email" className="fluent-input w-full p-2 rounded-lg text-sm" />
      </div>
    </div>
  );

  const renderCommunicationHistory = () => {
    if (client.isNew) {
      return (
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:w-1/3">
            <label htmlFor="client-new-comm-type" className="text-xs font-bold text-slate-500 uppercase block">Type</label>
            <select id="client-new-comm-type" value={newCommType} onChange={handleCommTypeChange} className="fluent-input p-2 rounded-lg text-sm">
              {ALLOWED_COMM_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
            </select>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <label htmlFor="client-initial-comm" className="text-xs font-bold text-slate-500 uppercase block">Details</label>
            <textarea id="client-initial-comm" value={newCommText} onChange={handleCommTextChange} placeholder="Log the initial communication details here..." maxLength={MAX_TEXT_LENGTH} className="fluent-input flex-1 min-h-[220px] p-3 rounded-lg text-sm resize-none" />
          </div>
          <p className="text-[10px] text-slate-400">This will be saved to history when you create the client.</p>
        </div>
      );
    }

    return (
      <>
        <div className="flex flex-col gap-2 mb-4">
          <div className="sm:w-40">
            <label htmlFor="client-comm-type" className="sr-only">Communication type</label>
            <select id="client-comm-type" value={newCommType} onChange={handleCommTypeChange} className="fluent-input w-full p-2 rounded-lg text-sm">
              {ALLOWED_COMM_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
            </select>
          </div>
          <textarea id="client-comm-text" value={newCommText} onChange={handleCommTextChange} onKeyDown={handleCommInputKeyDown} placeholder="Log a communication... (Ctrl+Enter to save)" aria-label="Communication details" maxLength={MAX_TEXT_LENGTH} className="fluent-input w-full p-2 rounded-lg text-sm resize-y min-h-[80px]" />
          <button type="button" onClick={handleAddComm} disabled={isSaving || !hasCommDraft} className="self-end bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">Add</button>
        </div>
      </>
    );
  };

  return (
    <>
      <div className={`fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={handleClose} />
      <div className={`fixed top-0 right-0 h-full w-full md:w-[600px] max-w-[95vw] acrylic-dark transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-50 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-modal="true" aria-labelledby="client-workspace-title" aria-busy={isSaving}>
        <div className="flex flex-col h-full bg-white/95 md:rounded-l-2xl">
          <h2 id="client-workspace-title" className="sr-only">Client workspace</h2>
          <div className="px-4 md:px-8 py-4 md:py-6 border-b border-slate-200/50 flex justify-between items-center gap-4">
            <input id="client-name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter Client Name" aria-label="Client name" maxLength={MAX_TITLE_LENGTH} className="text-2xl font-bold bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none w-full" />
            <button type="button" onClick={handleClose} aria-label="Close client workspace" disabled={isSaving} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"><Icons.Close /></button>
          </div>
          <div className="p-4 md:p-8 flex-1 overflow-y-auto flex flex-col gap-6 custom-scrollbar">
            
            {renderContactFields()}

            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-3 border-b pb-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase">{client.isNew ? 'Initial Communication' : 'Communication History'}</h3>
                {!client.isNew && (
                  <button type="button" onClick={() => setIsCommHistoryExpanded(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"><Icons.Maximize /> All Communications</button>
                )}
              </div>
              
              {renderCommunicationHistory()}

            </div>
          </div>
          <div className="p-4 md:p-6 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row justify-between items-center gap-3 md:rounded-bl-2xl">
            <button type="button" onClick={handleDelete} disabled={isSaving} className="text-rose-500 hover:text-rose-600 text-sm font-medium flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"><Icons.Trash /> {client.isNew ? 'Discard Draft' : 'Remove Client'}</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto bg-indigo-600 text-white px-8 py-2.5 rounded-lg text-sm font-medium shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">{isSaving ? 'Saving...' : 'Save & Close'}</button>
          </div>
        </div>
      </div>

      {/* Level 1 Modal: Expanded Communication History */}
      {isCommHistoryExpanded && (
        <>
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[60] transition-opacity duration-300" onClick={() => setIsCommHistoryExpanded(false)} />
          <div className="fixed inset-4 md:inset-8 lg:inset-x-32 lg:inset-y-12 bg-white rounded-2xl shadow-2xl z-[70] flex flex-col overflow-hidden modal-enter">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Communication History</h2>
                <p className="text-sm text-slate-500">{formData.name || 'Client'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setIsAddCommModalOpen(true)} className="flex items-center gap-1 bg-indigo-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"><Icons.Plus /> Add</button>
                <button type="button" onClick={() => setIsCommHistoryExpanded(false)} className="p-2 rounded-full hover:bg-slate-200 text-slate-500" aria-label="Close expanded view"><Icons.Close /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
              <div className="mx-auto max-w-4xl">
                <div className="space-y-4">
                  
                  <div className="flex flex-col sm:flex-row gap-3 justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex-1 w-full relative">
                      <input 
                        type="text" 
                        placeholder="Search communications..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="fluent-input w-full pl-3 pr-4 py-2 rounded-lg text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <select 
                        value={filterType} 
                        onChange={(e) => setFilterType(e.target.value)}
                        className="fluent-input text-sm p-2 rounded-lg border-slate-200 flex-1 sm:flex-none"
                      >
                        <option value="All">All Types</option>
                        {ALLOWED_COMM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <select 
                        value={sortOrder} 
                        onChange={(e) => setSortOrder(e.target.value)}
                        className="fluent-input text-sm p-2 rounded-lg border-slate-200 flex-1 sm:flex-none"
                      >
                        <option value="Newest">Newest First</option>
                        <option value="Oldest">Oldest First</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <h3 className="text-sm font-bold text-slate-700">Communications ({processedComms.length})</h3>
                  </div>

                  {localComms.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-12 bg-white border border-slate-200 border-dashed rounded-xl">No communications logged yet. Click 'Add' to start.</div>
                  ) : processedComms.length === 0 ? (
                    <div className="text-sm text-slate-400 text-center py-12 bg-white border border-slate-200 border-dashed rounded-xl">No communications match your search filters.</div>
                  ) : (
                    <div className="space-y-4">
                      {processedComms.map((communication) => (
                        <div key={communication.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
                          <div className="flex justify-between items-start gap-3 mb-4">
                            <span className="text-xs font-bold text-indigo-600 uppercase bg-indigo-50 px-3 py-1 rounded-md">{communication.type}</span>
                            <div className="flex items-center gap-3">
                              <time className="text-xs font-medium text-slate-500" dateTime={communication.date}>{new Date(communication.date).toLocaleString()}</time>
                              <button onClick={() => handleDeleteComm(communication.id)} className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-600 transition-opacity p-1 bg-rose-50 rounded" aria-label="Delete communication"><Icons.Trash /></button>
                            </div>
                          </div>
                          <textarea value={communication.notes} onChange={(e) => handleUpdateComm(communication.id, e.target.value)} maxLength={MAX_TEXT_LENGTH} className="w-full text-sm text-slate-700 bg-slate-50/50 border border-transparent hover:border-slate-200 focus:bg-white focus:border-indigo-300 focus:outline-none focus:ring-4 focus:ring-indigo-50/50 rounded-lg p-3 resize-y min-h-[80px] transition-all" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Level 2 Modal: Add New Communication */}
      {isAddCommModalOpen && (
         <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsAddCommModalOpen(false)} />
           <div className="relative w-full max-w-[600px] bg-white rounded-2xl shadow-2xl z-[90] flex flex-col overflow-hidden modal-enter">
             <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
               <h2 className="text-lg font-bold text-slate-800">Log Communication</h2>
               <button type="button" onClick={() => setIsAddCommModalOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><Icons.Close /></button>
             </div>
             <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Type</label>
                  <select value={newCommType} onChange={handleCommTypeChange} className="fluent-input w-full p-2.5 rounded-lg text-sm">
                    {ALLOWED_COMM_TYPES.map((type) => (<option key={type} value={type}>{type}</option>))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Details</label>
                  <textarea value={newCommText} onChange={handleCommTextChange} onKeyDown={handleCommInputKeyDown} placeholder="Enter communication notes... (Ctrl+Enter to save)" maxLength={MAX_TEXT_LENGTH} className="fluent-input w-full p-3 rounded-lg text-sm resize-y min-h-[150px]" />
                </div>
             </div>
             <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
               <button type="button" onClick={() => setIsAddCommModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
               <button type="button" onClick={handleAddComm} disabled={isSaving || !hasCommDraft} className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Save Entry</button>
             </div>
           </div>
         </div>
      )}
    </>
  );
};

export { ClientWorkspace }