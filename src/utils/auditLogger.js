import { getCurrentUser, getDeviceId } from '../config.js'

let _db = null

export const initAuditLogger = (db) => {
  _db = db
}

export const logAction = async ({
  action,
  resourceType,
  resourceId = null,
  changes = null,
  metadata = {},
}) => {
  if (!_db || _db.isVault) return

  const user = getCurrentUser()
  if (!user) return

  try {
    const entry = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `al-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId:       user.id || user.email || 'unknown',
      action,
      resourceType,
      resourceId,
      changes,
      metadata: {
        userAgent: navigator.userAgent.slice(0, 200),
        deviceId:  getDeviceId(),
        ...metadata,
      },
      timestamp: new Date().toISOString(),
    }

    _db.put('auditLogs', entry).catch(err =>
      console.warn('[Audit] Failed to write log entry:', err)
    )
  } catch (err) {
    console.warn('[Audit] Logger error:', err)
  }
}

export const logCreate  = (resourceType, resourceId, data) =>
  logAction({ action: 'created', resourceType, resourceId, changes: { after: data } })

export const logUpdate  = (resourceType, resourceId, before, after) =>
  logAction({ action: 'updated', resourceType, resourceId, changes: { before, after } })

export const logDelete  = (resourceType, resourceId, data) =>
  logAction({ action: 'deleted', resourceType, resourceId, changes: { before: data } })

export const logLogin   = (userId) =>
  logAction({ action: 'login', resourceType: 'users', resourceId: userId })

export const logLogout  = (userId) =>
  logAction({ action: 'logout', resourceType: 'users', resourceId: userId })
