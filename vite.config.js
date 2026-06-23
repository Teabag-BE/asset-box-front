import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 백엔드 CORS가 허용하는 origin(localhost:3000)으로 직접 띄운다.
    // → Origin 을 강제 교체할 필요가 없어짐. (그 교체가 Safari multipart POST 본문을 깨뜨렸음)
    host: 'localhost',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/s3-assets': {
        target: 'https://teabag-assetbox.s3.ap-northeast-2.amazonaws.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/s3-assets/, ''),
      },
    },
  },
})
