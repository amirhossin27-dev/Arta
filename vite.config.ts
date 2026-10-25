import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relativer Basis-Pfad, damit die App lokal und auf GitHub Pages (/Arta/) läuft.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
