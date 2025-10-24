import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs-extra'

// Copy Monaco Editor resources to public
const copyMonacoFiles = () => ({
  name: 'copy-monaco-files',
  buildStart: async () => {
    const monacoPath = resolve(__dirname, 'node_modules/monaco-editor/min/vs')
    const destPath = resolve(__dirname, 'public/monaco-editor/min/vs')
    
    await fs.copy(monacoPath, destPath, {
      filter: (src) => !src.includes('node_modules')
    })
  }
})

export default defineConfig({
  plugins: [react(), copyMonacoFiles()],
  server: {
    port: 5173,
    strictPort: true,
  },
  optimizeDeps: {
    include: ['monaco-editor/esm/vs/language/json/json.worker']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor']
        }
      }
    }
  }
})
