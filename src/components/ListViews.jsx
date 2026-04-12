import { useCRM } from '../context.jsx'

const ProjectsListView = ({ onOpenProject }) => {
  const { projects, clients, departments } = useCRM();
  const getStyle = (p) => p === 'Low' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : p === 'High' ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-amber-100 text-amber-700 border-amber-200';
  return (
   <div className="h-full w-full p-8 canvas-grid overflow-y-auto">
      <div className="max-w-6xl mx-auto acrylic rounded-2xl overflow-hidden shadow-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200/60 bg-white/40">
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Project</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Client</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Department</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Stage</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Due Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/50 bg-white/50">
            {projects.map(project => (
              <tr key={project.id} onClick={() => onOpenProject(project)} className="hover:bg-white cursor-pointer transition-colors group">
                <td className="p-4 font-medium text-slate-800 flex items-center gap-3"><div className={`w-2 h-2 rounded-full ${project.priority === 'Low' ? 'bg-emerald-400' : project.priority === 'High' ? 'bg-rose-400' : 'bg-amber-400'}`}></div>{project.name || 'Unnamed Project'}</td>
                <td className="p-4 text-sm text-slate-600">{clients.find(c => c.id === project.clientId)?.name || '-'}</td>
                <td className="p-4 text-sm text-slate-600">{departments.find(d => d.id === project.deptId)?.name || '-'}</td>
                <td className="p-4"><span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getStyle(project.priority)}`}>{project.stage}</span></td>
                <td className="p-4 text-sm text-slate-600">{project.dueDate || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ClientsListView = ({ onOpenClient }) => {
  const { clients } = useCRM();
  return (
      <div className="h-full w-full p-8 canvas-grid overflow-y-auto">
        <div className="max-w-6xl mx-auto acrylic rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/60 bg-white/40"><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Client Name</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Contact</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Email</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Phone</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 bg-white/50">
              {clients.map(client => (
                <tr key={client.id} onClick={() => onOpenClient(client)} className="hover:bg-white cursor-pointer transition-colors group">
                  <td className="p-4 font-bold text-slate-800">{client.name || 'Unnamed Client'}</td><td className="p-4 text-sm text-slate-600">{client.contactName || '-'}</td><td className="p-4 text-sm text-slate-600">{client.email || '-'}</td><td className="p-4 text-sm text-slate-600">{client.phone || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
};

const PeopleListView = ({ onOpenPerson }) => {
  const { people } = useCRM();
  return (
      <div className="h-full w-full p-8 canvas-grid overflow-y-auto">
        <div className="max-w-6xl mx-auto acrylic rounded-2xl overflow-hidden shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/60 bg-white/40"><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Name</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Role</th><th className="p-4 text-xs font-bold uppercase tracking-wider text-slate-500">Email</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 bg-white/50">
              {people.map(person => (
                <tr key={person.id} onClick={() => onOpenPerson(person)} className="hover:bg-white cursor-pointer transition-colors group">
                  <td className="p-4 font-bold text-slate-800 flex items-center gap-3"><div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">{person.name?.charAt(0) || '?'}</div>{person.name || 'Unnamed'}</td><td className="p-4 text-sm text-slate-600">{person.role || '-'}</td><td className="p-4 text-sm text-slate-600">{person.email || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
  );
};


export { ProjectsListView, ClientsListView, PeopleListView }
