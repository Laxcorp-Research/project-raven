import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const mainExternals = new Set([
  'better-sqlite3', 'assemblyai', 'pdf-parse', '@sentry/electron',
  '@sentry/electron/main', '@recallai/desktop-sdk', 'onnxruntime-node',
  'onnxruntime-web', 'sharp', 'posthog-node',
])

export default defineConfig({
  build: {
    outDir: 'dist/renderer',
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              // The public repository intentionally omits premium sources.
              // Preserve their guarded dynamic imports as runtime externals
              // so the OSS code build can complete and existing try/catch
              // fallbacks remain responsible for free-mode behavior.
              external: (id) => mainExternals.has(id) || /(^|\/)\.\.\/pro\//.test(id) || id.includes('/pro/'),
              output: {
                entryFileNames: 'index.js',
                banner: `
                  import { fileURLToPath as __vite_fileURLToPath } from 'url';
                  import { dirname as __vite_dirname } from 'path';
                  const __filename = __vite_fileURLToPath(import.meta.url);
                  const __dirname = __vite_dirname(__filename);
                `,
              },
            },
          },
        },
      },
      preload: {
        input: 'src/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist/preload',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'index.cjs',
              },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {
        build: {
          rollupOptions: {
            input: {
              index: 'src/renderer/index.html',
            },
          },
        },
        assetsInclude: ['**/*.js'],
      },
    }),
  ],
})
