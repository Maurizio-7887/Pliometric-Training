import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative assets make the build work from a GitHub Pages project sub-path.
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true }
});
