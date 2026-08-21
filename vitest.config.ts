import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@vocabulary/domain': fromRoot('./packages/domain/src/index.ts'),
      '@vocabulary/observability': fromRoot('./packages/observability/src/index.ts'),
      '@vocabulary/observability/browser': fromRoot('./packages/observability/src/browser.ts'),
      '@vocabulary/observability/node': fromRoot('./packages/observability/src/node.ts'),
    },
  },
  test: {
    coverage: {
      include: ['apps/**/src/**/*.ts', 'apps/web/server/**/*.ts', 'packages/**/*.ts'],
      reporter: ['text', 'html'],
    },
    include: ['{apps,packages}/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
