import { createContext, useContext } from 'react'

export const CRMContext = createContext()
export const useCRM = () => useContext(CRMContext)

export const StorageModeContext = createContext()
export const useStorageMode = () => useContext(StorageModeContext)

export const UserContext = createContext()
export const useUser = () => useContext(UserContext)

export const AuthContext = createContext()
export const useAuth = () => useContext(AuthContext)
