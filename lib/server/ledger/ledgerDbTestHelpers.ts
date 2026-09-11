// Shared helper for the *new* adversarial ledger tests that need a real
// Postgres connection (see ledger.moneyIntegrity.db.test.ts and
// ledger.settle.concurrency.test.ts) rather than a mocked PrismaClient.
//
// Not a test file itself (no `.test.ts` suffix, so Vitest's default include
// glob never picks it up) — plain infrastructure the new real-DB test files
// import from.
//
// Why this exists: Vitest (via Vite) does NOT auto-load `.env.local` the way
// Next.js's own `next dev`/`next build` do — confirmed empirically
// (`process.env.DATABASE_URL` is `undefined` under a plain `vitest run`
// even though `.env.local` sets it). `lib/server/prisma.ts` reads
// `DATABASE_URL` at module-evaluation time (`new PrismaClient()` at the top
// level), and static `import` statements are always fully evaluated before
// the importing file's own top-level statements run — so a `.env.local`
// loader written *after* a static `import { prisma } from
// '@/lib/server/prisma'` would run too late regardless of source-code
// ordering. Callers must therefore load env vars first, then *dynamically*
// `import('@/lib/server/prisma')` (a real function call, evaluated in
// normal execution order) — `loadLedgerTestEnv()` below only does the env
// loading; callers do the dynamic import themselves so each test file keeps
// full control over when its `prisma`/service imports resolve.
//
// `.env.local` is git-ignored (`.gitignore`: `.env*`) and points at this
// machine's own local Postgres (`dime_dev`) — not guaranteed to exist in
// every environment these tests might later run in. Every test file using
// this helper must treat the database as optional and skip (not fail) when
// it's unreachable, via `describe.skipIf(!(await isDbAvailable()))`.

import fs from 'node:fs'
import path from 'node:path'

let envLoaded = false

/** Parses `.env.local` (KEY=VALUE, `#` comments, optional quotes) into
 * `process.env`, without overwriting anything already set (e.g. by a CI
 * environment). Idempotent — safe to call from every test file's own
 * top-level setup. */
export function loadLedgerTestEnv(): void {
  if (envLoaded) return
  envLoaded = true

  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

/** True when `DATABASE_URL` is set and a real Postgres connection actually
 * works — env-var presence alone isn't enough (the URL could point at a
 * Postgres that isn't running). Every real-DB test file's top-level
 * `describe.skipIf` should gate on this, not on env-var presence alone. */
export async function isLedgerTestDbAvailable(): Promise<boolean> {
  loadLedgerTestEnv()
  if (!process.env.DATABASE_URL) return false
  try {
    const { prisma } = await import('@/lib/server/prisma')
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
