import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('pdfjs-dist')) return 'pdf-preview-vendor'
          if (id.includes('mammoth')) return 'docx-preview-vendor'
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
            return 'react-vendor'
          }
          if (id.includes('@radix-ui')) {
            return 'radix-vendor'
          }
          if (id.includes('framer-motion') || id.includes('motion')) {
            return 'motion-vendor'
          }
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts-vendor'
          }
          return 'vendor'
        },
      },
    },
  },
})
