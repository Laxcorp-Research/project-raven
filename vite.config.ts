import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

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
              external: [
                'better-sqlite3',
                'assemblyai',
                'pdf-parse',
                '@sentry/electron',
                '@sentry/electron/main',
                '@recallai/desktop-sdk',
                'onnxruntime-node',
                'onnxruntime-web',
                'sharp',
              ],
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
