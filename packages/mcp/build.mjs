import { build } from 'esbuild'

// Bundle the MCP server to a runnable dist (node, no tsx). Workspace @proba/* TS is compiled in;
// native / heavy modules stay external (resolved from node_modules at runtime).
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'dist/index.js',
  external: ['better-sqlite3', 'playwright', 'pg', 'mysql2', 'fsevents'],
  // ESM output needs a real `require` for bundled CJS deps that call require('util') etc.
  banner: {
    js: "import { createRequire as _createRequire } from 'module';\nimport { fileURLToPath as _f } from 'url';\nimport { dirname as _d } from 'path';\nconst require = _createRequire(import.meta.url);\nconst __filename = _f(import.meta.url);\nconst __dirname = _d(__filename);",
  },
  logLevel: 'info',
})
console.log('built dist/index.js')
