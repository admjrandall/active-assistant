import React, { useState, useEffect, useContext } from 'react'
import { CRMContext } from '../../context.jsx'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { formatDistance } from 'date-fns'

export const NotificationCenter = ({ isOpen, onClose }) => {
  const { DB } = useContext(CRMContext)
  const currentUser = useCurrentUser()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (currentUser) {
      loadNotifications()
      const interval = setInterval(loadNotifications, 30000) // Poll every 30s
      return () => clearInterval(interval)
    }
  }, [currentUser])

  const loadNotifications = async () => {
    if (!currentUser) return

    const all = await DB.getAll('notifications')
    const mine = all
      .filter(n => n.userId === currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    setNotifications(mine)
    setUnreadCount(mine.filter(n => !n.read).length)
  }

  const handleMarkAsRead = async (id) => {
    const notification = notifications.find(n => n.id === id)
    if (!notification) return

    await DB.put('notifications', { ...notification, read: true })
    await loadNotifications()
  }

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.read)
    for (const notification of unread) {
      await DB.put('notifications', { ...notification, read: true })
    }
    await loadNotifications()
  }

  const handleClearAll = async () => {
    if (!confirm('Clear all notifications?')) return

    for (const notification of notifications) {
      await DB.delete('notifications', notification.id)
    }
    await loadNotifications()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-[99998] flex flex-col animate-in slide-in-from-right-4">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Notifications</h2>
          <p className="text-xs text-slate-500 mt-0.5">{unreadCount} unread</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Actions */}
      {notifications.length > 0 && (
        <div className="flex gap-2 px-6 py-3 border-b border-slate-200 text-xs">
          <button onClick={handleMarkAllRead} className="text-indigo-600 hover:underline">
            Mark all read
          </button>
          <button onClick={handleClearAll} className="text-rose-600 hover:underline">
            Clear all
          </button>
        </div>
      )}

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-6xl mb-4">🔔</div>
            <p className="text-slate-600 font-medium">No notifications</p>
            <p className="text-xs text-slate-400 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={handleMarkAsRead}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const NotificationItem = ({ notification, onMarkAsRead }) => {
  const getIcon = (type) => {
    switch (type) {
      case 'mention': return '💬'
      case 'assignment': return '📌'
      case 'comment': return '💭'
      case 'deadline': return '⏰'
      case 'system': return 'ℹ️'
      default: return '🔔'
    }
  }

  return (
    <div
      className={`px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${
        !notification.read ? 'bg-indigo-50/30' : ''
      }`}
      onClick={() => onMarkAsRead(notification.id)}
    >
      <div className="flex gap-3">
        <div className="text-2xl flex-shrink-0">{getIcon(notification.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{notification.title}</h3>
            {!notification.read && (
              <div className="w-2 h-2 bg-indigo-600 rounded-full flex-shrink-0 mt-1"></div>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-0.5">{notification.message}</p>
          <p className="text-xs text-slate-400 mt-1">
            {formatDistance(new Date(notification.createdAt), new Date(), { addSuffix: true })}
          </p>
        </div>
      </div>
    </div>
  )
}

// Export unread count hook for header badge
export const useUnreadNotifications = () => {
  const { DB } = useContext(CRMContext)
  const currentUser = useCurrentUser()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const checkUnread = async () => {
      if (!currentUser) return

      const all = await DB.getAll('notifications')
      const unread = all.filter(n => n.userId === currentUser.id && !n.read)
      setCount(unread.length)
    }

    checkUnread()
    const interval = setInterval(checkUnread, 30000)
    return () => clearInterval(interval)
  }, [currentUser])

  return count
}
