import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // dev에서 /api 요청을 백엔드로 프록시.
    // 백엔드 CORS가 http://localhost:3000 만 허용하므로, 프록시가 Origin을 그 값으로 교체해 보냄.
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://localhost:3000')
          })
        },
      },
    },
  },
})
