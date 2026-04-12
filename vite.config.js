import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),   // Inlines all JS + CSS into one self-contained index.html
  ],

  // Relative paths so the built file works from file://, USB, or any location
  base: './',

  build: {
    outDir:  'dist',
    target:  'esnext',

    // vite-plugin-singlefile requirements — inline everything
    assetsInlineLimit:    100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    cssCodeSplit:          false,

    rollupOptions: {
      output: {
        // Single chunk — no dynamic imports that would break file://
        manualChunks: undefined,
        inlineDynamicImports: true,
      },
    },
  },
})
