import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),   // Inlines all JS + CSS into one self-contained index.html
  ],
  
  server: {
    headers: {
      server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://login.microsoftonline.com https://api.github.com https://*.crm.dynamics.com https://*.dynamics.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
},

    }, // <-- Added closing brace for headers
  },   // <-- Added closing brace for server

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