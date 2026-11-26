/**
 * Mengonfigurasi Vite dan plugin React untuk proses pengembangan serta build frontend.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
