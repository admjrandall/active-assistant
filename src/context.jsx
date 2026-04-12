import { createContext, useContext } from 'react'

export const CRMContext = createContext()
export const useCRM = () => useContext(CRMContext)

export const StorageModeContext = createContext()
export const useStorageMode = () => useContext(StorageModeContext)
