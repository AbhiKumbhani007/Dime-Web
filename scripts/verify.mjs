#!/usr/bin/env node
// Runs the five verify gates in order, reports every gate's result (never silently
// skips one), and exits non-zero if any failed. A gate that isn't wired yet must not
// appear here — see AGENTS.md for which gates are currently unwired and why.
import { spawnSync } from 'node:child_process'

const gates = [
  ['format:check', 'npm', ['run', '--silent', 'format:check']],
  ['lint', 'npm', ['run', '--silent', 'lint']],
  ['typecheck', 'npm', ['run', '--silent', 'typecheck']],
  ['test', 'npm', ['run', '--silent', 'test:coverage']],
  ['build', 'npm', ['run', '--silent', 'build']],
]

const results = []
for (const [name, cmd, args] of gates) {
  process.stdout.write(`\n── ${name} ──────────────────────────────\n`)
  const res = spawnSync(cmd, args, { stdio: 'inherit' })
  const passed = res.status === 0
  results.push([name, passed])
}

console.log('\n── verify summary ──────────────────────────')
for (const [name, passed] of results) {
  console.log(`${passed ? '✓' : '✗'} ${name}`)
}

const passedCount = results.filter(([, p]) => p).length
console.log(`\nverify: ${passedCount}/${results.length} gates passed.`)

const failed = results.filter(([, p]) => !p).map(([n]) => n)
if (failed.length > 0) {
  console.log(`FAILED — ${failed.join(', ')}`)
  process.exit(1)
}
