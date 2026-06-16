// On `pnpm dev`, give a fresh clone something to look at: if there is no local store yet,
// copy the curated demo store into place. Never overwrites existing local data.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const demo = join(root, 'demo', 'proba.db')
const local = process.env.PROBA_DB
  ? resolve(process.env.PROBA_DB)
  : join(root, '.proba', 'proba.db')

if (existsSync(local)) {
  process.exit(0) // keep the user's data
}
if (!existsSync(demo)) {
  console.warn('[proba] no demo store found (demo/proba.db). Run `pnpm seed:build` to create it.')
  process.exit(0)
}
mkdirSync(dirname(local), { recursive: true })
copyFileSync(demo, local)
console.log(`[proba] seeded local store from the demo → ${local}`)
