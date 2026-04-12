import { useCRM } from '../context.jsx'
import { Icons } from './Icons.jsx'

const SpatialCanvas = ({ type, onOpenItem }) => {
  const { projects, clients, people, tasks, DB, loadAllData } = useCRM();
  let items = type === 'projects' ? projects : type === 'clients' ? clients : people;
  let storeName = type;

  const handleDragEnd = async (e, item) => {
      const rect = e.target.parentElement.getBoundingClientRect();
      const x = Math.max(0, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
      await DB.put(storeName, { ...item, x, y });
      await loadAllData();
  };

  return (
    <div className="relative h-full w-full canvas-grid overflow-hidden">
      {items.map((item) => {
         let content = null;
         if (type === 'projects') {
             const projectTasks = tasks.filter(t => t.projectId === item.id && !t.done);
             const client = clients.find(c => c.id === item.clientId);
             const pColor = item.priority === 'Low' ? 'bg-emerald-400' : item.priority === 'High' ? 'bg-rose-400' : 'bg-amber-400';
             const hStyle = item.priority === 'Low' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : item.priority === 'High' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200';
             content = (
                 <>
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">{client ? <><Icons.Building /> {client.name}</> : 'No Client'}</div>
                      <div className={`w-3 h-3 rounded-full ${pColor} shadow-sm`}></div>
                    </div>
                    <div className="text-lg font-semibold mb-1 text-slate-800">{item.name || 'Unnamed Project'}</div>
                    {item.dueDate && <div className="text-xs text-rose-600 mb-3 font-medium">Due: {item.dueDate}</div>}
                    <div className="flex items-center justify-between">
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${hStyle}`}>{item.stage}</div>
                      {projectTasks.length > 0 && <div className="flex items-center gap-1 text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{projectTasks.length} tasks</div>}
                    </div>
                 </>
             );
         } else if (type === 'clients') {
             content = (
                 <>
                     <div className="w-12 h-12 bg-slate-800 text-white rounded-xl flex items-center justify-center font-bold text-lg mb-4 shadow-md">{item.name?.charAt(0) || '?'}</div>
                     <h3 className="font-bold text-lg text-slate-800 mb-1">{item.name || 'Unnamed Client'}</h3>
                     <div className="text-sm text-slate-500 font-medium">{item.contactName || 'No Contact Set'}</div>
                 </>
             );
         } else if (type === 'people') {
             content = (
                 <div className="w-48">
                     <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg mb-4">{item.name?.charAt(0) || '?'}</div>
                     <h3 className="font-bold text-lg text-slate-800">{item.name || 'Unnamed'}</h3>
                     <div className="text-sm text-slate-500 font-medium">{item.role || 'No Role'}</div>
                 </div>
             );
         }

         return (
          <button key={item.id} draggable="true" onDragEnd={(e) => handleDragEnd(e, item)} onClick={() => onOpenItem(item)} className={`absolute p-5 rounded-2xl transition-transform duration-200 hover:scale-105 active:scale-95 acrylic text-left group cursor-move ${item.stage === 'Review' ? 'ring-2 ring-indigo-500 ring-offset-2' : ''} ${type === 'projects' ? 'w-64' : ''}`} style={{ top: `${item.y || 10}%`, left: `${item.x || 10}%` }}>
            {content}
          </button>
        );
      })}
    </div>
  );
};


export { SpatialCanvas }
