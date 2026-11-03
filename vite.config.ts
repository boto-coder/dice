import { defineConfig } from 'vite';
import { pwaPlugin } from './pwa/vitePlugin.ts';

// The public site is served from a subpath (https://boto-coder.github.io/dice/),
// so the deploy workflow builds with BASE_PATH=/dice/. Locally it stays '/'.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [pwaPlugin()],
});
