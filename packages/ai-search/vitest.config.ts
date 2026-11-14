import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Pin resolution to this repo's workspace sources: in a git worktree
  // node_modules links into the main checkout, so bare specifiers would test
  // against the other checkout's sources (matches tsconfig paths)
  resolve: {
    alias: {
      // Subpath before the bare name: string aliases are prefix replacements
      '@genoffice/electron-utils/remote-image': resolve(
        here,
        '../electron-utils/src/remote-image.ts',
      ),
      '@genoffice/electron-utils/safe-remote-url': resolve(
        here,
        '../electron-utils/src/safe-remote-url.ts',
      ),
      '@genoffice/electron-utils/generated-images': resolve(
        here,
        '../electron-utils/src/generated-images.ts',
      ),
      '@genoffice/ai-provider': resolve(here, '../ai-provider/src/index.ts'),
    },
  },
  test: {
    // Naigen Desk: upstream tests run with the Genspark gate on
    setupFiles: [
      fileURLToPath(
        new URL('../ai-provider/tests/support/genspark-enabled-setup.ts', import.meta.url),
      ),
    ],
    include: ['tests/**/*.test.ts'],
  },
})
