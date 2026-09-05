#!/usr/bin/env node

// Everything waiting on a person, in one place, derived from files that already exist.
//
// A phase design is required to carry an "## Open questions" table, and a parked ticket is required to
// carry a "## Blocked on" section. Both are written where the work is; neither was ever collected. So
// "what is waiting on a client answer?" — the question that decides whether a phase can close — had no
// answer a session could reach, and the honest one lived in whichever transcript last discussed it.
//
// This reads, it does not store. There is no list to maintain, so there is nothing to go stale: delete
// the row and the question is closed, because the row IS the question.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PHASES = join(ROOT, 'phases')
const countOnly = process.argv.includes('--count')

/** Table rows under `## <heading>`, up to the next heading. */
function rowsUnder(md, heading) {
  const start = md.indexOf(`## ${heading}`)
  if (start === -1) return []
  const rest = md.slice(start + heading.length + 3)
  const end = rest.search(/\n## /)
  return (end === -1 ? rest : rest.slice(0, end))
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    )
    .filter((c) => c.length >= 3 && !/^-+$/.test(c[0]) && c[0].toLowerCase() !== '#')
}

const questions = []
const blocked = []

if (existsSync(PHASES)) {
  for (const phase of readdirSync(PHASES)) {
    const tdd = join(PHASES, phase, 'tdd.md')
    if (existsSync(tdd)) {
      for (const c of rowsUnder(readFileSync(tdd, 'utf8'), 'Open questions')) {
        // | # | Question | Owner | Blocks | Asked |
        questions.push({
          phase,
          q: c[1],
          owner: c[2] || '—',
          blocks: c[3] || '—',
          asked: c[4] || '',
        })
      }
    }

    const tickets = join(PHASES, phase, 'tickets')
    if (!existsSync(tickets)) continue
    // `_template.md` documents the section it is describing, so it matches every pattern below. A
    // check that counts its own template is a check reporting a number nobody can act on.
    for (const f of readdirSync(tickets).filter((f) => f.endsWith('.md') && !f.startsWith('_'))) {
      const md = readFileSync(join(tickets, f), 'utf8')
      const m = md.match(/## Blocked on\n+([\s\S]*?)(?=\n## |$)/)
      if (m && m[1].trim()) {
        blocked.push({ phase, task: f.replace(/\.md$/, ''), why: m[1].trim().split('\n')[0] })
      }
    }
  }
}

const total = questions.length + blocked.length

if (countOnly) {
  if (total) console.log(`${total} waiting on a person — bun run open`)
  process.exit(0)
}

if (!total) {
  console.log('\nopen: nothing is waiting on a person\n')
  process.exit(0)
}

console.log(`\nopen: ${total} waiting on a person\n`)

if (questions.length) {
  console.log('  DESIGN QUESTIONS — from each phase\'s "## Open questions"\n')
  for (const q of questions) {
    console.log(`  ${q.owner.padEnd(10)} ${q.q}`)
    console.log(
      `  ${''.padEnd(10)} ${q.phase} · blocks ${q.blocks}${q.asked ? ` · asked ${q.asked}` : ''}\n`,
    )
  }
}

if (blocked.length) {
  console.log('  PARKED TICKETS — a branch exists and is waiting on an answer\n')
  for (const b of blocked) {
    console.log(`  ${b.task.padEnd(10)} ${b.why}`)
    console.log(`  ${''.padEnd(10)} ${b.phase}\n`)
  }
}

// Exit 0 on purpose. An open question is a normal feature of a project — guessing one closed is the
// failure, not having one. Failing a build here would teach people to delete the row.
process.exit(0)
