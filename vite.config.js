const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

module.exports = defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  }
});
