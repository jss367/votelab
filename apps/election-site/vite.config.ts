import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3000,
  },
  esbuild: {
    loader: 'tsx', // OR "jsx"
    include: /src\/.*\.[tj]sx?$/,
    exclude: [],
  },
});
