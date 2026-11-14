import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Naigen Desk: upstream tests run with the Genspark gate on
    setupFiles: [
      fileURLToPath(
        new URL(
          '../../packages/ai-provider/tests/support/genspark-enabled-setup.ts',
          import.meta.url,
        ),
      ),
    ],
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    testTimeout: 20000,
  },
})
