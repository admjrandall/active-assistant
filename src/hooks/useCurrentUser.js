import { useContext } from 'react'
import { UserContext } from '../context.jsx'

export const useCurrentUser = () => {
  const userContext = useContext(UserContext)
  return userContext?.currentUser || null
}
