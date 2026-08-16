import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/main/__tests__/**/*.test.ts',
      'src/main/services/__tests__/**/*.test.ts',
      'src/renderer/src/lib/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    globals: true,
    mockReset: true,
    coverage: {
      provider: 'v8',
      include: ['src/main/**/*.ts'],
      exclude: [
        'src/main/__tests__/**',
        'src/main/**/__tests__/**',
        'src/main/index.ts',
        'src/main/systemAudioNative.ts',
      ],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
