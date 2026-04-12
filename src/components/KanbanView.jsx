import { useState } from 'react'
import { useCRM } from '../context.jsx'

const KanbanView = ({ onOpenProject }) => {
  const { projects, clients, departments, DB, loadAllData } = useCRM();
  const columns = ['Lead', 'Active', 'Review', 'Done'];
  const [dragOverCol, setDragOverCol] = useState(null);
  const [dragItem, setDragItem] = useState(null);

  const onDragStart = (e, project) => {
    setDragItem(project);
    e.dataTransfer.setData('projectId', project.id);
  };
  
  const onDrop = async (e, stage) => {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragItem) return;

    const colProjects = projects.filter(p => p.stage === stage);
    let newSortOrder = colProjects.length; 
    
    const dropY = e.clientY;
    const cards = document.querySelectorAll(`[data-stage="${stage}"] .kanban-card`);
    
    for (let i = 0; i < cards.length; i++) {
       const rect = cards[i].getBoundingClientRect();
       if (dropY < rect.top + rect.height / 2) { newSortOrder = i; break; }
    }

    const updatedItem = { ...dragItem, stage, sortOrder: newSortOrder, lastTouch: new Date().toISOString() };
    await DB.put('projects', updatedItem);

    let offset = 0;
    for(let i=0; i<colProjects.length; i++) {
       let p = colProjects[i];
       if(p.id === dragItem.id) continue;
       if(offset === newSortOrder) offset++;
       if(p.sortOrder !== offset) { await DB.put('projects', {...p, sortOrder: offset}); }
       offset++;
    }

    setDragItem(null);
    await loadAllData(); 
  };

  return (
    <div className="h-full w-full p-8 flex gap-6 overflow-x-auto canvas-grid">
      {columns.map(col => (
        <div key={col} data-stage={col} className={`w-80 flex-shrink-0 flex flex-col rounded-2xl transition-colors border-2 border-transparent ${dragOverCol === col ? 'drag-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragOverCol(col); }} onDragLeave={() => setDragOverCol(null)} onDrop={(e) => onDrop(e, col)}>
          <div className="flex justify-between items-center mb-4 px-2 acrylic py-2 rounded-xl">
            <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider">{col}</h3>
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{projects.filter(p => p.stage === col).length}</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto pr-2 pb-20">
            {projects.filter(p => p.stage === col).map(project => {
              const client = clients.find(c => c.id === project.clientId);
              return (
              <div key={project.id} draggable="true" onDragStart={(e) => onDragStart(e, project)} onClick={() => onOpenProject(project)} className="kanban-card w-full text-left acrylic p-4 rounded-xl hover:-translate-y-1 hover:shadow-lg transition-all cursor-grab active:cursor-grabbing">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{client?.name || departments.find(d => d.id === project.deptId)?.name || 'Unassigned'}</div>
                  <div className={`w-2 h-2 rounded-full ${project.priority === 'Low' ? 'bg-emerald-400' : project.priority === 'High' ? 'bg-rose-400' : 'bg-amber-400'}`}></div>
                </div>
                <div className="font-medium text-slate-800 mb-2">{project.name || 'Unnamed Project'}</div>
              </div>
            )})}
          </div>
        </div>
      ))}
    </div>
  );
};


export { KanbanView }
