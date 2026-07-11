import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),   // auto-generates a self-signed cert → HTTPS on all network interfaces
  ],
  server: {
    host: true,   // expose on LAN (0.0.0.0)
    https: {},    // enable HTTPS
    port: 5173,
  },
})
