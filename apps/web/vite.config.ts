// Vite dev server: proxy /api sang backend de trinh duyet coi la cung origin.
// [BM] khong doi Host (changeOrigin=false): /admin/auth/refresh kiem tra Origin phai cung host voi Host.
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // mo bang dien thoai qua tunnel https (GPS chi chay tren https); chi ap dung cho dev server
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.ngrok.app', '.loca.lt'],
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
});
