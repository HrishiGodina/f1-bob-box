import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) return 'vendor-charts';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
        },
      },
    },
  },
})
