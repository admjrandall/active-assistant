import { getCurrentUser, setCurrentUser } from '../config.js'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']

let inactivityTimer = null
let warningTimer = null
let onLockCallback = null
let activityHandler = null
let sessionTimeoutMinutes = 0

const clearTimers = () => {
  clearTimeout(inactivityTimer)
  clearTimeout(warningTimer)
  inactivityTimer = null
  warningTimer = null
}

const resolveTimeoutMinutes = (overrideMinutes) => {
  if (typeof overrideMinutes === 'number') {
    return overrideMinutes
  }

  return Number(getCurrentUser()?.preferences?.autoLockMinutes || 0)
}

const showWarning = () => {
  if (!sessionTimeoutMinutes || typeof window?.confirm !== 'function') {
    return
  }

  const keepWorking = window.confirm('Session will lock soon due to inactivity. Continue working?')
  if (keepWorking) {
    restartSessionTimer()
  }
}

export const restartSessionTimer = (overrideMinutes) => {
  clearTimers()

  sessionTimeoutMinutes = resolveTimeoutMinutes(overrideMinutes)
  if (!sessionTimeoutMinutes || sessionTimeoutMinutes <= 0) {
    return
  }

  const timeoutMs = sessionTimeoutMinutes * 60 * 1000
  const warningDelay = Math.max(timeoutMs - 60_000, Math.floor(timeoutMs * 0.8))

  warningTimer = window.setTimeout(showWarning, warningDelay)
  inactivityTimer = window.setTimeout(() => {
    if (onLockCallback) {
      onLockCallback()
    }
  }, timeoutMs)
}

export const updateLastActivity = () => {
  const user = getCurrentUser()
  if (!user) return

  const updatedUser = {
    ...user,
    lastActivity: new Date().toISOString(),
  }

  setCurrentUser(updatedUser)
}

export const initSessionManager = (lockCallback, options = {}) => {
  teardownSessionManager()
  onLockCallback = lockCallback

  activityHandler = () => {
    updateLastActivity()
    restartSessionTimer(options.autoLockMinutes)
  }

  ACTIVITY_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, activityHandler, { passive: true })
  })

  restartSessionTimer(options.autoLockMinutes)

  return teardownSessionManager
}

export const lockSession = () => {
  clearTimers()
  if (onLockCallback) {
    onLockCallback()
  }
}

export const teardownSessionManager = () => {
  clearTimers()

  if (activityHandler) {
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, activityHandler)
    })
  }

  activityHandler = null
  onLockCallback = null
  sessionTimeoutMinutes = 0
}
