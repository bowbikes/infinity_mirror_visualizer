import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// potrace pulls in jimp → pngjs/gifwrap/strtok3, which reach for Node's
// util/stream/zlib/assert + the Buffer global. Vite externalizes those to
// empty stubs by default, so preprocessing dies silently in the browser.
// Polyfilling fixes the runtime; the polyfills are scoped to dev+build only
// because vitest runs under real Node where those modules already exist
// (polyfilling `path` in particular breaks fixture-loading test paths).
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'test'
      ? []
      : [
          nodePolyfills({
            include: ['buffer', 'util', 'stream', 'assert', 'zlib', 'process', 'fs', 'path'],
            globals: { Buffer: true, process: true, global: true },
            protocolImports: true,
          }),
        ]),
  ],
  server: { port: 3000 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
}))
