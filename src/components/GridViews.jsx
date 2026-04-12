import { useCRM } from '../context.jsx'

const ClientsGridView = ({ onOpenClient }) => {
  const { clients, projects, communications } = useCRM();
  return (
    <div className="h-full w-full p-8 canvas-grid overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto pt-4">
        {clients.map(client => (
          <button key={client.id} onClick={() => onOpenClient(client)} className="acrylic p-6 rounded-2xl text-left hover:scale-105 transition-transform group flex flex-col h-full">
            <div className="w-12 h-12 bg-slate-800 text-white rounded-xl flex items-center justify-center font-bold text-lg mb-4 shadow-md">{client.name?.charAt(0) || '?'}</div>
            <h3 className="font-bold text-lg text-slate-800 mb-1">{client.name || 'Unnamed Client'}</h3>
            <div className="text-sm text-slate-500 font-medium mb-4 flex-1">{client.contactName || 'No Contact Set'}</div>
            <div className="text-xs text-slate-400 flex justify-between w-full border-t border-slate-200/50 pt-3">
              <span>{projects.filter(p => p.clientId === client.id).length} Projects</span>
              <span>{communications.filter(c => c.clientId === client.id).length} Logs</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const PeopleGridView = ({ onOpenPerson }) => {
  const { people } = useCRM();
  return (
    <div className="h-full w-full p-8 canvas-grid overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto pt-4">
        {people.map(person => (
          <button key={person.id} onClick={() => onOpenPerson(person)} className="acrylic p-6 rounded-2xl text-left hover:scale-105 transition-transform group">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">{person.name?.charAt(0) || '?'}</div>
            <h3 className="font-bold text-lg text-slate-800">{person.name || 'Unnamed'}</h3>
            <div className="text-sm text-slate-500 font-medium mb-1">{person.role || 'No Role'}</div>
            <div className="text-xs text-slate-400 truncate">{person.email || 'No email set'}</div>
          </button>
        ))}
      </div>
    </div>
  );
};


const ProjectsGridView = ({ onOpenProject }) => {
  const { projects, clients, departments, tasks } = useCRM();
  
  const getStyle = (p) => p === 'Low' ? 'bg-emerald-100 text-emerald-700' : p === 'High' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
  const getDot = (p) => p === 'Low' ? 'bg-emerald-400' : p === 'High' ? 'bg-rose-400' : 'bg-amber-400';

  return (
<div className="h-full w-full p-8 canvas-grid overflow-y-auto">
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto pt-4">
    {projects.map(project => {
      const client = clients.find(c => c.id === project.clientId);
      const dept = departments.find(d => d.id === project.deptId);
      const openTasks = tasks.filter(t => t.projectId === project.id && !t.done).length;

      return (
        <button key={project.id} onClick={() => onOpenProject(project)} className="acrylic p-6 rounded-2xl text-left hover:scale-105 transition-transform group flex flex-col h-full">
          <div className="flex justify-between items-start mb-4 w-full">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate pr-2">
              {client?.name || dept?.name || 'Unassigned'}
            </div>
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${getDot(project.priority)} shadow-sm`}></div>
          </div>
          
          <h3 className="font-bold text-xl text-slate-800 mb-2">{project.name || 'Unnamed Project'}</h3>
          <div className="text-xs text-rose-600 mb-4 font-medium flex-1">{project.dueDate ? `Due: ${project.dueDate}` : 'No due date'}</div>
          
          <div className="flex items-center justify-between w-full border-t border-slate-200/50 pt-4 mt-auto">
            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${getStyle(project.priority)}`}>
              {project.stage}
            </span>
            <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
              {openTasks} open tasks
            </span>
          </div>
        </button>
      );
    })}
  </div>
</div>
  );
};


export { ClientsGridView, PeopleGridView, ProjectsGridView }
