import React, { useState, useEffect, useContext } from 'react'
import { CRMContext } from '../../context.jsx'
import { usePermission } from '../../hooks/usePermission.js'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'

export const WorkspaceManagement = ({ showToast }) => {
  const { DB, loadAllData } = useContext(CRMContext)
  const currentUser = useCurrentUser()
  const [workspaces, setWorkspaces] = useState([])
  const [users, setUsers] = useState([])
  const [isCreating, setIsCreating] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState(null)

  const canCreate = usePermission('workspace', 'create')
  const canUpdate = usePermission('workspace', 'update')
  const canDelete = usePermission('workspace', 'delete')

  useEffect(() => {
    loadWorkspaces()
    loadUsers()
  }, [])

  const loadWorkspaces = async () => {
    const data = await DB.getAll('workspaces')
    setWorkspaces(data)
  }

  const loadUsers = async () => {
    const data = await DB.getAll('users')
    setUsers(data.filter(u => u.status === 'active'))
  }

  const handleCreate = async (formData) => {
    const workspace = {
      id: DB.generateId(),
      name: formData.name,
      description: formData.description,
      ownerId: currentUser.id,
      memberIds: [currentUser.id],
      settings: {
        visibility: 'private',
        allowGuestAccess: false,
        defaultPermission: 'read',
      },
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      lastModified: new Date().toISOString(),
    }

    await DB.put('workspaces', workspace)
    await loadWorkspaces()
    setIsCreating(false)
    showToast?.('Workspace created successfully')
  }

  const handleUpdate = async (id, updates) => {
    const workspace = workspaces.find(w => w.id === id)
    const updated = {
      ...workspace,
      ...updates,
      lastModified: new Date().toISOString(),
    }
    await DB.put('workspaces', updated)
    await loadWorkspaces()
    setEditingWorkspace(null)
    showToast?.('Workspace updated')
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this workspace? All projects and data will remain, but workspace organization will be lost.')) return
    await DB.delete('workspaces', id)
    await loadWorkspaces()
    showToast?.('Workspace deleted')
  }

  const handleAddMember = async (workspaceId, userId) => {
    const workspace = workspaces.find(w => w.id === workspaceId)
    if (!workspace.memberIds.includes(userId)) {
      workspace.memberIds.push(userId)
      await handleUpdate(workspaceId, { memberIds: workspace.memberIds })
    }
  }

  const handleRemoveMember = async (workspaceId, userId) => {
    const workspace = workspaces.find(w => w.id === workspaceId)
    workspace.memberIds = workspace.memberIds.filter(id => id !== userId)
    await handleUpdate(workspaceId, { memberIds: workspace.memberIds })
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Workspaces</h2>
          <p className="text-sm text-slate-500 mt-1">Organize projects and teams into workspaces</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            + New Workspace
          </button>
        )}
      </div>

      {/* Workspace List */}
      <div className="space-y-4">
        {workspaces.map(workspace => (
          <WorkspaceCard
            key={workspace.id}
            workspace={workspace}
            users={users}
            onEdit={() => setEditingWorkspace(workspace)}
            onDelete={() => handleDelete(workspace.id)}
            onAddMember={(userId) => handleAddMember(workspace.id, userId)}
            onRemoveMember={(userId) => handleRemoveMember(workspace.id, userId)}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        ))}
      </div>

      {/* Create Modal */}
      {isCreating && (
        <WorkspaceFormModal
          onSave={handleCreate}
          onClose={() => setIsCreating(false)}
        />
      )}

      {/* Edit Modal */}
      {editingWorkspace && (
        <WorkspaceFormModal
          workspace={editingWorkspace}
          onSave={(data) => handleUpdate(editingWorkspace.id, data)}
          onClose={() => setEditingWorkspace(null)}
        />
      )}
    </div>
  )
}

const WorkspaceCard = ({ workspace, users, onEdit, onDelete, onAddMember, onRemoveMember, canUpdate, canDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const members = users.filter(u => workspace.memberIds.includes(u.id))
  const nonMembers = users.filter(u => !workspace.memberIds.includes(u.id))

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-slate-900">{workspace.name}</h3>
          <p className="text-sm text-slate-500 mt-1">{workspace.description}</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              👥 {members.length} members
            </span>
            <span className="flex items-center gap-1">
              🔒 {workspace.settings.visibility}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {canUpdate && (
            <button onClick={onEdit} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
              Edit
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} className="px-3 py-1.5 text-sm text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50">
              Delete
            </button>
          )}
          <button onClick={() => setIsExpanded(!isExpanded)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Members</h4>
          <div className="space-y-2">
            {members.map(user => (
              <div key={user.id} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{user.displayName}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </div>
                </div>
                {user.id !== workspace.ownerId && canUpdate && (
                  <button onClick={() => onRemoveMember(user.id)} className="text-xs text-rose-600 hover:underline">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {canUpdate && nonMembers.length > 0 && (
            <div className="mt-3">
              <select
                onChange={(e) => e.target.value && onAddMember(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
              >
                <option value="">+ Add Member</option>
                {nonMembers.map(user => (
                  <option key={user.id} value={user.id}>{user.displayName} ({user.email})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const WorkspaceFormModal = ({ workspace, onSave, onClose }) => {
  const [name, setName] = useState(workspace?.name || '')
  const [description, setDescription] = useState(workspace?.description || '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ name, description })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999] p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in slide-in-from-bottom-4">
        <h2 className="text-xl font-bold text-slate-900 mb-4">
          {workspace ? 'Edit Workspace' : 'Create Workspace'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
              Workspace Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm"
              placeholder="e.g., Marketing Team"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm resize-none"
              rows={3}
              placeholder="Optional workspace description"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-lg text-slate-600 font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
            >
              {workspace ? 'Save Changes' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
