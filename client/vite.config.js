import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// vite.config.js (or vite.config.ts)
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';


export default defineConfig({
  plugins: [tailwindcss()],
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
});

