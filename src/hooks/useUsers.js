import { useState, useEffect } from 'react'
import { useCRM, useStorageMode } from '../context.jsx'

export const useUsers = () => {
  const { DB, people } = useCRM()
  const { storageMode } = useStorageMode()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!DB) return

    const load = async () => {
      setLoading(true)
      try {
        if (storageMode === 'cloud') {
          const cloudUsers = await DB.getAll('users')
          setUsers(cloudUsers.map(u => ({
            id: u.id,
            displayName: u.displayName || u.email || 'Unknown',
            email: u.email || '',
            role: u.role,
            avatar: u.avatar,
          })))
        } else {
          setUsers((people || []).map(p => ({
            id: p.id,
            displayName: p.name || p.email || 'Unknown',
            email: p.email || '',
            role: p.role,
          })))
        }
      } catch (err) {
        console.error('[useUsers] Failed to load users:', err)
        setUsers([])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [DB, storageMode, people])

  return { users, loading }
}
