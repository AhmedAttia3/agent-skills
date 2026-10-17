import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * إعداد Vite: الواجهة في مجلد web/ وتُبنى إلى server/public
 * حتى يخدمها سيرفر Node نفسه (عملية واحدة، بلا CORS وبلا سيرفر ثانٍ).
 */
export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000',
    },
  },
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2019',
    chunkSizeWarningLimit: 900,
  },
});
