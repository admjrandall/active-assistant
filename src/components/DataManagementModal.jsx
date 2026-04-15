import { useState, useRef } from 'react'
import { useCRM } from '../context.jsx'
import { Icons } from './Icons.jsx'
import { jsonToCsv, csvToJson } from '../utils.js'

const DataManagementModal = ({ isOpen, onClose, showToast }) => {
    const { DB, loadAllData } = useCRM();
    const fileInputRef = useRef(null);
    const [importTarget, setImportTarget] = useState(null);

    const entities = [
      { store: 'projects', label: 'Projects' },
      { store: 'tasks', label: 'Tasks' },
      { store: 'people', label: 'Team People' },
      { store: 'clients', label: 'Clients / CRM' },
      { store: 'departments', label: 'Departments' },
      { store: 'communications', label: 'Communications' }
    ];

    const handleExport = async (storeName, format = 'json') => {
      try {
        const data = await DB.getAll(storeName);
        if (data.length === 0) {
          showToast(`No records found in ${storeName} to export.`);
          return;
        }

        let fileContent, mimeType, extension;

        if (format === 'csv') {
          fileContent = jsonToCsv(data);
          mimeType = 'text/csv;charset=utf-8;';
        extension = 'csv';
        } else {
          fileContent = JSON.stringify(data, null, 2);
          mimeType = 'application/json';
          extension = 'json';
        }

        const blob = new Blob([fileContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ActiveAssistant_${storeName}_${new Date().toISOString().split('T')[0]}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
        showToast(`Exported ${data.length} records from ${storeName} as ${format.toUpperCase()}.`);
      } catch (error) {
        showToast(`Failed to export ${storeName}.`);
      }
    };

  const triggerImport = (storeName) => {
    setImportTarget(storeName);
    if (fileInputRef.current) fileInputRef.current.value = ''; 
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (!file || !importTarget) return;

  const isCSV = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  reader.onload = async (event) => {
try {
  let importedData;
try {
  const rawData = isCSV ? csvToJson(event.target.result) : JSON.parse(event.target.result);
  
  // Validate structure
  if (!Array.isArray(rawData)) {
    throw new Error('Import data must be an array');
  }
  
  // Prevent prototype pollution
  importedData = rawData.map(item => {
    const safe = {};
    for (const key in item) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      safe[key] = item[key];
    }
    return safe;
  });
} catch (error) {
  showToast(`Import failed: ${error.message}`);
  return;
}

  let count = 0;

  for (const item of importedData) {
    // 1. AUTO-GENERATE ID: User doesn't need to provide this
    if (!item.id) item.id = DB.generateId();

    // 2. AUTO-REBUILD NOTES: If user wrote plain text, wrap it into system format
    if (item.notes && typeof item.notes === 'string') {
      item.notes = [{ id: DB.generateId(), text: item.notes, date: new Date().toISOString() }];
    } else if (!item.notes) {
      item.notes = [];
    }

    // 3. AUTO-REBUILD LAYOUT: Set a default view for Canvas Mode
    if (importTarget === 'projects' && !item.workspaceLayout) {
      item.workspaceLayout = {
        narrative: { x: 50, y: 100, w: 400, h: 300 },
        tasks: { x: 480, y: 100, w: 450, h: 500 },
        notes: { x: 50, y: 420, w: 400, h: 300 },
        details: { x: 950, y: 100, w: 300, h: 350 }
      };
      item.lastTouch = new Date().toISOString();
      item.x = 10; item.y = 10; // Default canvas position
    }

    await DB.put(importTarget, item);
    count++;
  }
  
  await loadAllData();
  showToast(`Successfully imported ${count} items.`);
} catch (error) {
  showToast("Import failed. Ensure headers match the template.");
} finally {
  setImportTarget(null);
}
  };
  reader.readAsText(file);
};

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl z-[110] flex flex-col overflow-hidden modal-enter">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Icons.Database className="text-indigo-600" /> Data Management
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"><Icons.Close /></button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[70vh] custom-scrollbar">
          <p className="text-sm text-slate-500 mb-6">Export your data for backups, or import JSON/CSV files to merge records into your local database.</p>
          
          <div className="space-y-3">
            {entities.map(({ store, label }) => (
              <div key={store} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-slate-200 rounded-xl hover:border-indigo-200 transition-colors bg-slate-50/50 gap-3">
                <span className="font-semibold text-slate-700 text-sm">{label}</span>
                <div className="flex gap-2">
                  <button onClick={() => triggerImport(store)} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm">
                    <Icons.Upload size={14} /> Import
                  </button>
                  
                  {/* Split Export Button Group */}
                  <div className="flex bg-indigo-50 rounded-lg border border-indigo-100 overflow-hidden shadow-sm">
                    <button onClick={() => handleExport(store, 'json')} className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 hover:bg-indigo-100 border-r border-indigo-200/60 transition-colors" title="Export as JSON">
                      JSON
                    </button>
                    <button onClick={() => handleExport(store, 'csv')} className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-700 hover:bg-indigo-100 transition-colors" title="Export as CSV">
                      CSV
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hidden file input now accepts both extensions */}
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json,.csv" className="hidden" />
      </div>
    </div>
  );
};

     

// --- MAIN APP ---

export { DataManagementModal }
