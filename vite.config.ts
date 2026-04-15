import { defineConfig } from 'vite';

/** Vite config uses no extra plugins — valid jam build is static HTML/JS for the browser. */
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
