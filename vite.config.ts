import { defineConfig } from 'vite';
import { pwaPlugin } from './pwa/vitePlugin.ts';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [pwaPlugin()],
});
