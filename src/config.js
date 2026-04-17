// ============================================================================
// CONFIGURATION & SCHEMA
// M365 config is now dynamic and stored in localStorage upon first setup.
// ============================================================================

import { DATAVERSE_COLUMN_MAPS, JSON_FIELDS } from './db/schemas.js'

export const STORAGE_MODE_KEY = 'aa-storage-mode'  // Now only 'offline' or 'cloud'
export const M365_SETUP_KEY   = 'aa-m365-setup'
export const CURRENT_USER_KEY = 'aa-current-user'  // NEW: Current user session (Cloud mode)
export const DEVICE_ID_KEY    = 'aa-device-id'     // NEW: Unique device identifier

// Retrieve user-provided M365 settings
export const getM365Config = () => {
  const stored = localStorage.getItem(M365_SETUP_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

// NEW: Get or create device ID
export const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

// NEW: Get current user session
export const getCurrentUser = () => {
  const stored = localStorage.getItem(CURRENT_USER_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

// NEW: Set current user session
export const setCurrentUser = (user) => {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

// Dataverse schema (imported from schemas.js)
export const DATAVERSE_SCHEMA = {
  tables: {
    users: 'users',
    workspaces: 'workspaces',
    permissions: 'permissions',
    auditLogs: 'auditlogs',
    comments: 'comments',
    notifications: 'notifications',
    timeEntries: 'timeentries',
    projects: 'projects',
    tasks: 'tasks',
    people: 'people',
    departments: 'departments',
    clients: 'clients',
    communications: 'communications',
  },
  columnMaps: DATAVERSE_COLUMN_MAPS,
  jsonFields: JSON_FIELDS,
}

export const MAX_TITLE_LENGTH = 500
export const MAX_TEXT_LENGTH = 10000
export const CLOSE_ANIMATION_MS = 400
export const MAX_ZINDEX = 999999

// NEW: Password requirements
export const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
}

// NEW: Session timeout settings (minutes)
export const SESSION_TIMEOUT_OPTIONS = [5, 15, 30, 60, 0] // 0 = never

// NEW: Default user preferences
export const DEFAULT_USER_PREFERENCES = {
  theme: 'light',
  autoLockMinutes: 15,
  defaultView: 'canvas',
  emailNotifications: true,
  pushNotifications: true,
}
