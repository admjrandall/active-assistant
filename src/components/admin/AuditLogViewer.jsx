import React, { useState, useEffect } from 'react'
import { useCRM } from '../../context.jsx'

const ACTION_COLORS = {
  created:  'text-green-400  bg-green-400/10',
  updated:  'text-blue-400   bg-blue-400/10',
  deleted:  'text-red-400    bg-red-400/10',
  viewed:   'text-slate-400  bg-slate-400/10',
  login:    'text-indigo-400 bg-indigo-400/10',
  logout:   'text-slate-400  bg-slate-400/10',
}

export const AuditLogViewer = () => {
  const { DB } = useCRM()
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState({ action: '', resourceType: '', search: '' })

  useEffect(() => {
    if (!DB) return
    DB.getAll('auditLogs')
      .then(entries => {
        const sorted = [...entries].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        )
        setLogs(sorted)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [DB])

  const filtered = logs.filter(log => {
    if (filter.action && log.action !== filter.action) return false
    if (filter.resourceType && log.resourceType !== filter.resourceType) return false
    if (filter.search) {
      const q = filter.search.toLowerCase()
      return (
        log.userId?.toLowerCase().includes(q) ||
        log.resourceId?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const formatTime = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-3 p-4 border-b border-slate-700">
        <input
          type="text"
          placeholder="Search by user or resource ID..."
          value={filter.search}
          onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
        />
        <select
          value={filter.action}
          onChange={e => setFilter(f => ({ ...f, action: e.target.value }))}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All Actions</option>
          {['created', 'updated', 'deleted', 'login', 'logout'].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          value={filter.resourceType}
          onChange={e => setFilter(f => ({ ...f, resourceType: e.target.value }))}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All Resources</option>
          {['projects', 'tasks', 'clients', 'people', 'users', 'workspaces'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Loading audit logs...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-500 text-sm">No audit log entries found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-700">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Resource</th>
                <th className="text-left px-4 py-3">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map(log => (
                <tr key={log.id} className="border-b border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono text-xs">{formatTime(log.timestamp)}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-[150px] truncate">{log.userId || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] || 'text-slate-400 bg-slate-400/10'}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{log.resourceType || '—'}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs max-w-[120px] truncate">{log.resourceId || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-700 text-xs text-slate-500">
        Showing {Math.min(filtered.length, 200)} of {filtered.length} entries
      </div>
    </div>
  )
}
