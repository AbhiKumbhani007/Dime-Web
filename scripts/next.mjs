#!/usr/bin/env node

// The one next step, derived from what is on disk and in git.
//
// `board.mjs --next` answers the TASK question — which tickets are workable. That is the right answer
// only once a project has tasks. Before that it is confidently wrong: on a fresh clone it reads the
// example phase and says "start T003", which is a task from a template you are meant to delete.
//
// So this asks the PROJECT question first and falls through to the task question when the project is
// far enough along to have one. Every branch below is decided from a file that exists or a git ref that
// does, so it cannot be stale and it cannot be wrong about a state you are not in. Nothing is stored,
// nothing is typed, and there is no network call — this runs on a Stop hook, so it has to be fast.
//
// It reports ONE step. A list of five things you could do is the problem it exists to solve.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const has = (p) => existsSync(join(ROOT, p))
const read = (p) => (has(p) ? readFileSync(join(ROOT, p), 'utf8') : '')
const git = (...args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

const ifChanged = process.argv.includes('--if-changed')
// Inside .git because that is the one directory guaranteed to exist here, guaranteed never to be
// committed, and not wiped by `bun install`.
const STATE = join(ROOT, '.git/devx-next-step')

// One extra line, and only when there is something to say. "What is waiting on a PERSON" is a different
// question from "what is workable", and it is the one nothing else answers. A count and where to look —
// not a second menu.
function waiting() {
  const r = spawnSync('node', [join(ROOT, 'scripts/open.mjs'), '--count'], { encoding: 'utf8' })
  return (r.stdout || '').trim()
}

/** Print and exit. `cmd` is the thing to type; `why` is one line of reason. */
function answer(cmd, why) {
  const line = cmd ? `${cmd}  —  ${why}` : why
  if (ifChanged) {
    // On a Stop hook, saying the same thing after every turn is noise nobody reads. Only speak when
    // the answer has actually moved.
    const last = existsSync(STATE) ? readFileSync(STATE, 'utf8') : ''
    if (last === line) process.exit(0)
    try {
      writeFileSync(STATE, line)
    } catch {}
  }
  const w = waiting()
  console.log(`\nnext:  ${line}\n${w ? `open:  ${w}\n` : ''}`)
  process.exit(0)
}

// ── the project questions, in order ────────────────────────────────────────────

if (!has('.git')) answer('git init', 'not a git repository yet, so no hook can be installed')

// Placeholders and unwired gates are both setup's business, and setup explains them properly.
const claude = read('AGENTS.md')
if (
  claude.includes('*list them, or say "any"*') ||
  claude.includes('*command, port, and anything')
) {
  answer('/setup', 'AGENTS.md → "This project" still has rows nothing can guess')
}

let scripts = {}
try {
  scripts = JSON.parse(read('package.json')).scripts || {}
} catch {}
if (!['format:check', 'lint', 'typecheck', 'test', 'build'].some((g) => scripts[g])) {
  answer('/setup', 'no stack gate is wired, so `bun run verify` checks nothing')
}

// The inputs arrive from outside the delivery team. Naming the missing one is the whole answer —
// there is no command for it, and writing it here would mean authoring the scope the client is held to.
if (!has('docs/inputs/prd.md')) {
  answer(null, 'docs/inputs/prd.md is missing. It arrives from whoever owns scope — ask for it')
}

// A phase directory that is only the shipped example means no project has begun.
const phases = has('phases')
  ? readdirSync(join(ROOT, 'phases')).filter((d) => d !== '001-example-phase')
  : []
if (!phases.length) answer('/tdd <slug>', 'no phase yet — the design is the first thing we produce')

const noTasks = phases.filter((p) => !has(`phases/${p}/tasks.md`))
if (noTasks.length) {
  answer(`/cut ${noTasks[0]}`, `phases/${noTasks[0]}/ has a design and no tasks cut from it`)
}

// ── on a ticket branch, the question is about this ticket ──────────────────────

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const task = (branch.match(/^(T\d{3,}|[A-Z][A-Z0-9]+-\d+)/) || [])[1]

if (task) {
  const spec = phases.map((p) => `phases/${p}/tickets/${task}.md`).find(has)
  if (!spec) answer(`/ticket ${task}`, `on ${branch} with no spec — the spec comes before the code`)

  const base = (claude.match(/\*\*Base branch\*\*\s*\|\s*`([^`]+)`/) || [])[1] || 'main'
  const ahead = git('rev-list', '--count', `${base}..HEAD`)
  const pushed = git('rev-parse', '--abbrev-ref', '@{u}')

  if (ahead === '1') answer(`/ticket ${task}`, 'the spec is committed — implement it')
  if (!pushed)
    answer(`/ticket ${task}`, `${ahead} commits, nothing pushed — finish and open the PR`)
  answer(
    null,
    `${task} is pushed. Wait for the checks, then the merge is yours — never your own approval`,
  )
}

// ── otherwise, the task question — board.mjs owns the graph ────────────────────

const board = spawnSync('node', [join(ROOT, 'scripts/board.mjs'), '--next'], { encoding: 'utf8' })
const out = board.stdout || ''
const n = (k) => Number((out.match(new RegExp(`(\\d+) ${k}`)) || [])[1] || 0)
const counted = /next: \d+ ready/.test(out)

// A board that could not be read is not a board with nothing left on it, and the difference matters:
// one means go home, the other means something is broken. An early version of this file collapsed them
// and cheerfully reported "every task is done" against a tasks.md it had failed to parse.
if (board.status !== 0 || !counted) {
  answer('bun run board', 'the board did not render — the task graph or the file format is wrong')
}

const total = n('ready') + n('in progress') + n('blocked') + n('done')
if (total === 0) {
  answer('/cut ' + phases[0], `phases/${phases[0]}/tasks.md has no task lines board can read`)
}

if (n('ready') === 0 && n('in progress') === 0) {
  if (n('blocked') > 0) {
    answer(
      null,
      `${n('blocked')} blocked and none ready — a dependency is wrong, run \`bun run board\``,
    )
  }
  answer('/harvest', 'every task is done — turn what the phase learned into rules and checks')
}

// Something is workable. board.mjs already prints it well, so show its output rather than a summary
// of it — a second rendering is a second thing to keep in step.
if (ifChanged) {
  const line = out.trim()
  const last = existsSync(STATE) ? readFileSync(STATE, 'utf8') : ''
  if (last === line) process.exit(0)
  try {
    writeFileSync(STATE, line)
  } catch {}
}
process.stdout.write(out)
const w = waiting()
if (w) console.log(`  open:  ${w}\n`)
