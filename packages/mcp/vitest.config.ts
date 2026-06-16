import { defineConfig } from 'vitest/config'

// Only run package tests — never the generated artifacts under .proba/ (those are Playwright specs).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], exclude: ['.proba/**', 'node_modules/**'] },
})
