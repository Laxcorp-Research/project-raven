import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    outDir: 'dist/renderer',
  },
  // Electron's network service on macOS can hang or crash on `localhost`
  // (::1). Bind IPv4 so `npm run dev` actually paints the dashboard.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
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
