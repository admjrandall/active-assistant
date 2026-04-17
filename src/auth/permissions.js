const createPermissionSet = (resource, actions) =>
  actions.reduce((accumulator, action) => {
    const permission = `${resource}:${action}`
    const constantKey = action.replace(/[^a-z0-9]+/gi, '_').toUpperCase() || 'ANY'
    accumulator[constantKey] = permission
    accumulator[action] = permission
    return accumulator
  }, {})

export const PERMISSION_RESOURCES = [
  'user',
  'workspace',
  'project',
  'task',
  'client',
  'person',
  'department',
  'communication',
  'comment',
  'timeEntry',
  'settings',
  'audit',
  'permission',
  'team',
]

export const PERMISSIONS = {
  USER: createPermissionSet('user', ['create', 'read', 'update', 'delete', 'invite']),
  WORKSPACE: createPermissionSet('workspace', ['create', 'read', 'update', 'delete']),
  PROJECT: createPermissionSet('project', ['create', 'read', 'update', 'delete', '*']),
  TASK: createPermissionSet('task', ['create', 'read', 'update', 'delete', 'delete-own', '*']),
  CLIENT: createPermissionSet('client', ['create', 'read', 'update', 'delete', '*']),
  PERSON: createPermissionSet('person', ['create', 'read', 'update', 'delete', '*']),
  DEPARTMENT: createPermissionSet('department', ['create', 'read', 'update', 'delete', '*']),
  COMMUNICATION: createPermissionSet('communication', ['create', 'read', 'update', 'delete', '*']),
  COMMENT: createPermissionSet('comment', ['create', 'read', 'update', 'delete', 'update-own', 'delete-own', '*']),
  TIME_ENTRY: createPermissionSet('timeEntry', ['create', 'read', 'update', 'delete', 'read-own', 'update-own', 'delete-own', '*']),
  SETTINGS: createPermissionSet('settings', ['manage']),
  AUDIT: createPermissionSet('audit', ['view']),
  PERMISSION: createPermissionSet('permission', ['grant', 'revoke']),
  TEAM: createPermissionSet('team', ['manage']),
}

export const OWNERSHIP_FIELDS = ['createdBy', 'ownerId', 'userId', 'assigneeId']

export const getPermissionKey = (resource, action) => `${resource}:${action}`

export const getOwnPermissionKey = (resource, action) => `${resource}:${action}-own`

export const getAllPermissionKeys = () =>
  Object.values(PERMISSIONS).flatMap((group) => Object.values(group))
