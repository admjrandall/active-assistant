import { OWNERSHIP_FIELDS, PERMISSIONS, getOwnPermissionKey, getPermissionKey } from './permissions.js'

export const ROLE_KEYS = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
}

const normalizeRole = (role) => String(role || '').trim().toLowerCase()

export const ROLES = {
  [ROLE_KEYS.ADMIN]: {
    name: 'Administrator',
    description: 'Full system access, user management, and security controls.',
    permissions: [
      PERMISSIONS.USER.CREATE,
      PERMISSIONS.USER.READ,
      PERMISSIONS.USER.UPDATE,
      PERMISSIONS.USER.DELETE,
      PERMISSIONS.WORKSPACE.CREATE,
      PERMISSIONS.WORKSPACE.READ,
      PERMISSIONS.WORKSPACE.UPDATE,
      PERMISSIONS.WORKSPACE.DELETE,
      PERMISSIONS.PROJECT['*'],
      PERMISSIONS.TASK['*'],
      PERMISSIONS.CLIENT['*'],
      PERMISSIONS.PERSON['*'],
      PERMISSIONS.DEPARTMENT['*'],
      PERMISSIONS.COMMUNICATION['*'],
      PERMISSIONS.COMMENT['*'],
      PERMISSIONS.TIME_ENTRY['*'],
      PERMISSIONS.SETTINGS.MANAGE,
      PERMISSIONS.AUDIT.VIEW,
      PERMISSIONS.PERMISSION.GRANT,
      PERMISSIONS.PERMISSION.REVOKE,
    ],
  },
  [ROLE_KEYS.MANAGER]: {
    name: 'Manager',
    description: 'Manage delivery work, teams, and shared workspaces.',
    permissions: [
      PERMISSIONS.USER.READ,
      PERMISSIONS.USER.INVITE,
      PERMISSIONS.WORKSPACE.CREATE,
      PERMISSIONS.WORKSPACE.READ,
      PERMISSIONS.WORKSPACE.UPDATE,
      PERMISSIONS.PROJECT['*'],
      PERMISSIONS.TASK['*'],
      PERMISSIONS.CLIENT['*'],
      PERMISSIONS.PERSON.READ,
      PERMISSIONS.COMMENT['*'],
      PERMISSIONS.TIME_ENTRY['*'],
      PERMISSIONS.TEAM.MANAGE,
    ],
  },
  [ROLE_KEYS.CONTRIBUTOR]: {
    name: 'Contributor',
    description: 'Create and update day-to-day work they own or are assigned.',
    permissions: [
      PERMISSIONS.PROJECT.CREATE,
      PERMISSIONS.PROJECT.READ,
      PERMISSIONS.PROJECT.UPDATE,
      PERMISSIONS.TASK.CREATE,
      PERMISSIONS.TASK.READ,
      PERMISSIONS.TASK.UPDATE,
      PERMISSIONS.TASK.DELETE_OWN,
      PERMISSIONS.CLIENT.READ,
      PERMISSIONS.PERSON.READ,
      PERMISSIONS.COMMENT.CREATE,
      PERMISSIONS.COMMENT.READ,
      PERMISSIONS.COMMENT.UPDATE_OWN,
      PERMISSIONS.COMMENT.DELETE_OWN,
      PERMISSIONS.TIME_ENTRY.CREATE,
      PERMISSIONS.TIME_ENTRY.READ_OWN,
      PERMISSIONS.TIME_ENTRY.UPDATE_OWN,
      PERMISSIONS.TIME_ENTRY.DELETE_OWN,
    ],
  },
  [ROLE_KEYS.VIEWER]: {
    name: 'Viewer',
    description: 'Read-only access to shared work and personal time entries.',
    permissions: [
      PERMISSIONS.PROJECT.READ,
      PERMISSIONS.TASK.READ,
      PERMISSIONS.CLIENT.READ,
      PERMISSIONS.PERSON.READ,
      PERMISSIONS.COMMENT.READ,
      PERMISSIONS.TIME_ENTRY.READ_OWN,
    ],
  },
}

export const hasPermission = (role, permission) => {
  const roleDefinition = ROLES[normalizeRole(role)]
  if (!roleDefinition) return false

  if (roleDefinition.permissions.includes(permission)) {
    return true
  }

  const [resource] = permission.split(':')
  return roleDefinition.permissions.includes(`${resource}:*`)
}

const isItemOwner = (user, item) => {
  if (!user?.id || !item) return false

  if (Array.isArray(item.sharedWith) && item.sharedWith.includes(user.id)) {
    return true
  }

  if (Array.isArray(item.memberIds) && item.memberIds.includes(user.id)) {
    return true
  }

  return OWNERSHIP_FIELDS.some((field) => item[field] === user.id)
}

export const canPerform = (user, resource, action, item = null) => {
  if (!user?.role) return false

  const permission = getPermissionKey(resource, action)
  if (hasPermission(user.role, permission)) {
    return true
  }

  if (item && hasPermission(user.role, getOwnPermissionKey(resource, action))) {
    return isItemOwner(user, item)
  }

  return false
}

export const getRoleOptions = () =>
  Object.entries(ROLES).map(([value, definition]) => ({
    value,
    label: definition.name,
    description: definition.description,
  }))

export const isAdmin = (user) => normalizeRole(user?.role) === ROLE_KEYS.ADMIN

export const canAccessAdmin = (user) => {
  const role = normalizeRole(user?.role)
  return role === ROLE_KEYS.ADMIN || role === ROLE_KEYS.MANAGER
}
