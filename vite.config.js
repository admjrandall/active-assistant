import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: Replace 'active-assistant' with your actual GitHub repo name
const REPO_NAME = 'active-assistant'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${REPO_NAME}/` : '/',
  build: {
    outDir: 'dist',
    // Keep assets inline so the app works from any path
    assetsInlineLimit: 100000,
  },
})
