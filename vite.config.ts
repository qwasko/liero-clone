import { defineConfig } from 'vite';

export default defineConfig({
  base: '/liero-clone/',
  server: {
    port: 3000,
  },
  build: {
    target: 'es2020',
  },
});
