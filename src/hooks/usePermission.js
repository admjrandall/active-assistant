import { useContext } from 'react'
import { UserContext } from '../context.jsx'
import { canPerform } from '../auth/rbac.js'

export const usePermission = (resource, action, item = null) => {
  const userContext = useContext(UserContext)
  const currentUser = userContext?.currentUser || null

  if (!currentUser) {
    return false
  }

  return canPerform(currentUser, resource, action, item)
}
