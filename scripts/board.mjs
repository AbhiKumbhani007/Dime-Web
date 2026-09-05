#!/usr/bin/env node

// Generates phases/<phase>/dag-board.html from that phase's tasks.md.
//
// tasks.md is the ONLY place completion is recorded. The board is derived from it every time, so the
// two cannot disagree — tick a checkbox, run this, done. Never hand-edit dag-board.html.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PHASES = join(ROOT, 'phases')
const quiet = process.argv.includes('--quiet')
const openFlag = process.argv.includes('--open')
const written = []
const OPENER =
  process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'

// ── parse ──────────────────────────────────────────────────────────────────────
// ## Phase 1: Tag — Name
// - [ ] T001 [P] [US1] [TEST] Description `path` (after T000, T002)
function parse(src) {
  const phases = []
  const tasks = []
  let phase = null
  let fenced = false

  for (const raw of src.split('\n')) {
    if (raw.startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue

    // "Feature" is ours. Stage and Phase are accepted because tasks.md files predate the rename and
    // because spec-kit writes Phase — normalised on the way out, so the board only ever says one.
    const head = raw.match(/^##\s+(?:Feature|Stage|Phase)\s+(\d+)\s*:\s*(.+?)\s*$/i)
    if (head) {
      const label = head[2]
      const [tag, ...rest] = label.split(/\s+[—–-]\s+/)
      phase = { id: Number(head[1]), tag: tag.trim(), name: rest.join(' — ').trim() || tag.trim() }
      phases.push(phase)
      continue
    }

    const row = raw.match(/^\s*-\s*\[([ xX])\]\s+([A-Z]+[A-Z0-9]*-?\d+)\s+(.*)$/)
    if (!row || !phase) continue

    let body = row[3]
    const flags = []
    body = body.replace(/^(\[[A-Z0-9]+\]\s*)+/, (m) => {
      flags.push(...m.match(/\[([A-Z0-9]+)\]/g).map((f) => f.slice(1, -1)))
      return ''
    })

    const deps = []
    body = body.replace(/\(after\s+([^)]+)\)\s*$/i, (_, list) => {
      deps.push(...list.split(/[,\s]+/).filter(Boolean))
      return ''
    })

    const file = (body.match(/`([^`]+)`\s*$/) || [])[1] || ''
    if (file) body = body.replace(/`[^`]+`\s*$/, '')

    tasks.push({
      id: row[2],
      phase: phase.id,
      done: row[1].toLowerCase() === 'x',
      parallel: flags.includes('P'),
      test: flags.includes('TEST'),
      story: flags.find((f) => /^US\d+$/.test(f)) || null,
      desc: body.trim().replace(/\s+/g, ' '),
      file,
      deps,
    })
  }
  return { phases, tasks }
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )

function render(title, phases, tasks, inProgress = new Set(), anyBranch = inProgress) {
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
  for (const t of tasks) t.dependents = []
  for (const t of tasks) {
    for (const d of t.deps) byId[d]?.dependents.push(t.id)
  }

  // Precedence, and the middle row is the one that is easy to get wrong: a ticket ticked [X] whose
  // branch is still unmerged is FINISHED BUT NOT LANDED. Calling that "done" overstates it — the
  // work is not on the base branch and nothing downstream can build on it yet.
  const statusOf = (t) => {
    const depsDone = t.deps.every((d) => !byId[d] || byId[d].done)
    if (t.done) {
      if (!depsDone) return 'regress'
      // Merge state only discriminates between finished-and-landed and finished-but-not-landed.
      return inProgress.has(t.id) ? 'merging' : 'done'
    }
    if (!depsDone) return 'blocked'
    // NOT done and a branch exists at all => somebody is on it. Deliberately does NOT ask whether
    // the branch is merged: a branch created moments ago has no commits beyond the base, so
    // `git branch --no-merged` omits it and it read as "ready" while a session was actively
    // working in it. That is exactly the collision this state exists to prevent.
    return anyBranch.has(t.id) ? 'progress' : 'ready'
  }
  for (const t of tasks) t.status = statusOf(t)

  const count = (s) => tasks.filter((t) => t.status === s).length
  const done = count('done')
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  const card = (t) => {
    const chips = [
      t.parallel
        ? '<span class="chip p" title="Parallelisable — different files, no incomplete dependency, so another session can take a sibling at the same time">P</span>'
        : '',
      t.story
        ? `<span class="chip story" title="User story this task serves">${esc(t.story)}</span>`
        : '',
      t.test
        ? '<span class="chip test" title="Writes tests, and they must fail before the code exists">TEST</span>'
        : '',
    ].join('')
    return `<article class="card s-${t.status}" data-id="${esc(t.id)}" tabindex="0">
  <div class="card-top"><span class="tid">${esc(t.id)}</span>${chips}</div>
  <div class="desc">${esc(t.desc)}</div>
  ${t.file ? `<div class="file">${esc(t.file)}</div>` : ''}
  <div class="card-foot"><span class="status-tag"><i></i>${t.status}</span>${
    t.deps.length
      ? `<span class="depcount">${t.deps.length} dep${t.deps.length > 1 ? 's' : ''}</span>`
      : ''
  }</div>
</article>`
  }

  const boardHtml = phases
    .map((ph) => {
      const inPhase = tasks.filter((t) => t.phase === ph.id)
      if (!inPhase.length) return ''
      const d = inPhase.filter((t) => t.done).length
      return `<section class="phase">
  <div class="phase-head"><span class="idx">Feature ${ph.id}</span><span class="tag">${esc(ph.tag)}</span>
    <span class="nm">${esc(ph.name)}</span><span class="ct">${d}/${inPhase.length}</span></div>
  <div class="cards">${inPhase.map(card).join('')}</div>
</section>`
    })
    .join('')

  const flowHtml = phases
    .map((ph, i) => {
      const inPhase = tasks.filter((t) => t.phase === ph.id)
      const all = inPhase.length > 0 && inPhase.every((t) => t.done)
      return `${i ? '<span class="flow-arrow">→</span>' : ''}<div class="flow-node${all ? ' complete' : ''}">
      <div class="ph">${esc(ph.tag)}</div><div class="nm">${esc(ph.name)}</div></div>`
    })
    .join('')

  const data = tasks.map((t) => ({
    id: t.id,
    desc: t.desc,
    file: t.file,
    status: t.status,
    deps: t.deps,
    dependents: t.dependents,
  }))

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Task DAG</title>
<style>
:root{--bg:#EEF1F5;--surface:#fff;--surface-2:#F5F8FB;--ink:#17202E;--muted:#5B6676;--line:#D8DFE8;
--line-strong:#C3CCD8;--accent:#1E6E8C;--accent-soft:#E1EEF3;--done:#2E9E6B;--done-soft:#E2F2EA;
--ready:#B9740F;--ready-soft:#F7ECD9;--blocked:#6E7986;--blocked-soft:#ECEFF3;--regress:#C0453B;
--regress-soft:#F7E3E1;--merging:#6D4AAF;--merging-soft:#EEE8F9;
--shadow:0 1px 2px rgba(23,32,46,.06),0 6px 20px rgba(23,32,46,.06);
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--sans:system-ui,-apple-system,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#10151D;--surface:#171E28;--surface-2:#1E2732;--ink:#E7ECF2;
--muted:#9BA7B5;--line:#2A3542;--line-strong:#384656;--accent:#4F9CC0;--accent-soft:#16303B;
--done:#40B786;--done-soft:#14312A;--ready:#E0A03C;--ready-soft:#33280F;--blocked:#8B97A5;
--blocked-soft:#232D39;--regress:#E0685C;--regress-soft:#34201E;--merging:#A98BE0;--merging-soft:#2A2136;
--shadow:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.28)}}
/* One spacing scale. Every margin and padding below is a multiple of it — the previous version used
   5,6,7,9,10,11,14,16,18,22px chosen ad hoc, which is what made it feel crowded rather than dense. */
:root{--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;
--r-sm:6px;--r-md:10px;--r-lg:14px;--pill:999px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans);
-webkit-font-smoothing:antialiased}
.wrap{max-width:1520px;margin:0 auto;padding:var(--s6) var(--s6) var(--s7)}
@media(max-width:640px){.wrap{padding:var(--s5) var(--s4) var(--s6)}}

/* ── header ─────────────────────────────────────────────────────────── */
.eyebrow{font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--accent)}
h1{margin:var(--s2) 0 var(--s2);font-size:clamp(22px,2.4vw,30px);letter-spacing:-.02em;line-height:1.15}
.sub{color:var(--muted);font-size:14px;max-width:84ch;margin:0}

/* ── summary ────────────────────────────────────────────────────────── */
.summary{display:flex;gap:var(--s5);align-items:center;flex-wrap:wrap;margin:var(--s5) 0 var(--s4);
padding:var(--s4) var(--s5);background:var(--surface);border:1px solid var(--line);
border-radius:var(--r-lg);box-shadow:var(--shadow)}
.progress-wrap{flex:1;min-width:260px}
.progress-top{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;
color:var(--muted);margin-bottom:var(--s2);letter-spacing:.02em}
.progress-top b{color:var(--ink);font-variant-numeric:tabular-nums;font-size:14px}
.bar{height:10px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--pill);
overflow:hidden}
.bar span{display:block;height:100%;background:var(--done);width:${pct}%;border-radius:var(--pill);
transition:width .4s ease}
.pills{display:flex;gap:var(--s2);flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;gap:var(--s2);font-size:12.5px;font-weight:600;
padding:var(--s2) var(--s3);border-radius:var(--pill);border:1px solid transparent}
.pill .n{font-variant-numeric:tabular-nums;font-weight:750;font-size:14px}
.pill.done{background:var(--done-soft);color:var(--done)}
.pill.progress{background:var(--accent-soft);color:var(--accent)}
.pill.ready{background:var(--ready-soft);color:var(--ready)}
.pill.blocked{background:var(--blocked-soft);color:var(--blocked)}
.pill.regress{background:var(--regress-soft);color:var(--regress)}
.pill.merging{background:var(--merging-soft);color:var(--merging)}

/* ── phase flow ─────────────────────────────────────────────────────── */
.flow{display:flex;align-items:stretch;gap:var(--s2);flex-wrap:wrap;margin-bottom:var(--s5)}
.flow-node{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);
padding:var(--s3) var(--s4);min-width:150px;transition:border-color .15s}
.flow-node.complete{border-color:var(--done);background:var(--done-soft)}
.flow-node .ph{font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;
color:var(--muted);margin-bottom:var(--s1)}
.flow-node .nm{font-size:13px;font-weight:600;line-height:1.3}
.flow-arrow{color:var(--line-strong);align-self:center;font-size:15px}

/* ── legend ─────────────────────────────────────────────────────────── */
.legend{display:flex;gap:var(--s4);flex-wrap:wrap;margin-bottom:var(--s5);padding-bottom:var(--s4);
border-bottom:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:var(--s2)}
.legend i{width:10px;height:10px;border-radius:3px;flex:none}
.legend .chip{font-size:10px;font-weight:700;padding:2px var(--s2);border-radius:var(--r-sm)}
.legend .sep{width:1px;height:16px;background:var(--line);padding:0}
.legend span{cursor:help}

/* ── layout ─────────────────────────────────────────────────────────── */
.layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:var(--s5);align-items:start}
@media(max-width:1120px){.layout{grid-template-columns:minmax(0,1fr)}}

/* ── phases ─────────────────────────────────────────────────────────── */
.phase{margin-bottom:var(--s6)}
.phase:last-child{margin-bottom:0}
.phase-head{display:flex;align-items:baseline;gap:var(--s3);margin-bottom:var(--s3);flex-wrap:wrap;
padding-bottom:var(--s2);border-bottom:1px solid var(--line)}
.phase-head .idx{font:700 11px var(--mono);letter-spacing:.06em;color:var(--muted);text-transform:uppercase}
.phase-head .tag{font-size:15px;font-weight:700;color:var(--ink);letter-spacing:-.01em}
.phase-head .nm{font-size:13px;color:var(--muted);flex:1}
.phase-head .ct{font:600 12px var(--mono);color:var(--muted);font-variant-numeric:tabular-nums}

/* ── cards ──────────────────────────────────────────────────────────── */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:var(--s3)}
.card{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--blocked);
border-radius:var(--r-md);padding:var(--s4);box-shadow:var(--shadow);cursor:pointer;
transition:transform .14s ease,box-shadow .14s ease,opacity .14s ease}
.card:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(23,32,46,.07),0 12px 28px rgba(23,32,46,.1)}
.card:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.card.s-done{border-left-color:var(--done)}
.card.s-done .desc{color:var(--muted)}
.card.s-ready{border-left-color:var(--ready)}
.card.s-progress{border-left-color:var(--accent);background:var(--accent-soft)}
.card.s-blocked{border-left-color:var(--blocked)}
.card.s-regress{border-left-color:var(--regress)}
.card.s-merging{border-left-color:var(--merging)}
.s-merging .status-tag{color:var(--merging)}.s-merging .status-tag i{background:var(--merging)}
.dep .st.merging{color:var(--merging)}
.card.selected{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft),var(--shadow)}
.card.dim{opacity:.4}
.card.rel-up{box-shadow:0 0 0 2px var(--regress-soft),var(--shadow)}
.card.rel-down{box-shadow:0 0 0 2px var(--accent-soft),var(--shadow)}
.card-top{display:flex;align-items:center;gap:var(--s2);margin-bottom:var(--s2);flex-wrap:wrap}
.tid{font:700 12.5px var(--mono);letter-spacing:.03em}
.chip{font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px var(--s2);border-radius:var(--r-sm);
line-height:1.5}
.chip.p{background:var(--accent-soft);color:var(--accent)}
.chip.story{background:var(--surface-2);color:var(--muted);border:1px solid var(--line)}
.chip.test{background:var(--regress-soft);color:var(--regress)}
.desc{font-size:13.5px;line-height:1.5}
.file{font:11px/1.45 var(--mono);color:var(--muted);margin-top:var(--s2);overflow-wrap:anywhere}
.card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:var(--s3);
padding-top:var(--s2);border-top:1px solid var(--line);gap:var(--s2)}
.status-tag{display:inline-flex;align-items:center;gap:var(--s2);font-size:11.5px;font-weight:650;
text-transform:capitalize;letter-spacing:.01em}
.status-tag i{width:8px;height:8px;border-radius:50%;background:var(--blocked);flex:none}
.s-done .status-tag{color:var(--done)}.s-done .status-tag i{background:var(--done)}
.s-ready .status-tag{color:var(--ready)}.s-ready .status-tag i{background:var(--ready)}
.s-progress .status-tag{color:var(--accent)}.s-progress .status-tag i{background:var(--accent)}
.s-regress .status-tag{color:var(--regress)}.s-regress .status-tag i{background:var(--regress)}
.depcount{font:11px var(--mono);color:var(--muted)}

/* ── inspector ──────────────────────────────────────────────────────── */
aside{position:sticky;top:var(--s5);background:var(--surface);border:1px solid var(--line);
border-radius:var(--r-lg);padding:var(--s5);box-shadow:var(--shadow);max-height:calc(100vh - var(--s7));
overflow:auto}
aside{position:relative}
aside h2{margin:0 var(--s6) var(--s2) 0;font:700 17px var(--mono);letter-spacing:.02em}
.clear{position:absolute;top:var(--s3);right:var(--s3);width:28px;height:28px;line-height:1;
font-size:19px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface-2);
color:var(--muted);cursor:pointer;transition:color .14s,border-color .14s}
.clear:hover{color:var(--ink);border-color:var(--line-strong)}
aside .sub{font-size:13.5px;line-height:1.5;color:var(--ink)}
aside .empty{color:var(--muted);font-size:13px;line-height:1.55}
aside h3{margin:var(--s5) 0 var(--s2);font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;
color:var(--muted);font-weight:700}
.dep{display:flex;justify-content:space-between;align-items:center;gap:var(--s3);width:100%;
text-align:left;font:12px var(--mono);padding:var(--s2) var(--s3);margin-bottom:var(--s1);
border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface-2);color:var(--ink);
cursor:pointer;transition:border-color .14s,background .14s}
.dep:hover{border-color:var(--line-strong);background:var(--bg)}
.dep .st{font-weight:700;flex:none}
.dep .st.done{color:var(--done)}.dep .st.ready{color:var(--ready)}
.dep .st.progress{color:var(--accent)}
.dep .st.blocked{color:var(--blocked)}.dep .st.regress{color:var(--regress)}
.note{margin-top:var(--s5);font-size:12px;line-height:1.5;color:var(--muted);
border-top:1px solid var(--line);padding-top:var(--s3)}
</style></head><body><div class="wrap">
<div class="eyebrow">Phase ${esc(title.replace(/^(\d+)-.*/, '$1'))} · Dependency Board</div>
<h1>${esc(title.replace(/^\d+-/, '').replace(/-/g, ' '))} — Task DAG</h1>
<div class="sub">${tasks.length} tasks across ${phases.length} features · select a task to see what blocks it and what it unblocks · <strong>generated from tasks.md</strong></div>

<section class="summary">
  <div class="progress-wrap">
    <div class="progress-top"><span>Progress</span><span><b>${done}</b> of <b>${tasks.length}</b> · ${pct}%</span></div>
    <div class="bar"><span></span></div>
  </div>
  <div class="pills">
    <span class="pill done"><span class="n">${done}</span> done</span>
    ${count('merging') ? `<span class="pill merging"><span class="n">${count('merging')}</span> to merge</span>` : ''}
    ${count('progress') ? `<span class="pill progress"><span class="n">${count('progress')}</span> in progress</span>` : ''}
    <span class="pill ready"><span class="n">${count('ready')}</span> ready</span>
    <span class="pill blocked"><span class="n">${count('blocked')}</span> blocked</span>
    ${count('regress') ? `<span class="pill regress"><span class="n">${count('regress')}</span> regressed</span>` : ''}
  </div>
</section>

<nav class="flow">${flowHtml}</nav>

<div class="legend">
  <span title="Ticked in tasks.md, and its branch is merged"><i style="background:var(--done)"></i> done</span>
  <span title="Ticked in tasks.md, but its branch is not merged yet"><i style="background:var(--merging)"></i> to merge</span>
  <span title="A branch exists for this task — someone is on it"><i style="background:var(--accent)"></i> in progress</span>
  <span title="Every dependency is done and no branch exists — start now"><i style="background:var(--ready)"></i> ready</span>
  <span title="Waiting on an upstream task that is not done"><i style="background:var(--blocked)"></i> blocked</span>
  <span title="Ticked, but a task it depends on is not — reopened upstream"><i style="background:var(--regress)"></i> regressed</span>
  <span class="sep"></span>
  <span title="Parallelisable — another session can take a sibling at the same time"><b class="chip p">P</b> parallel</span>
  <span title="The user story this task serves"><b class="chip story">US1</b> story</span>
  <span title="Writes tests, and they must fail before the code exists"><b class="chip test">TEST</b> tests first</span>
</div>

<div class="layout">
  <main id="board">${boardHtml}</main>
  <aside id="inspector"><div class="empty">Select a task to inspect its dependencies — <strong>blocked by</strong> upstream, <strong>unblocks</strong> downstream.<br><br>Click it again, click outside, or press <strong>Esc</strong> to clear.</div></aside>
</div>
</div>
<script>
var T = ${JSON.stringify(data)};
var BY = {}; T.forEach(function(t){ BY[t.id] = t; });
var box = document.getElementById('inspector');
var sel = null;
var EMPTY = box.innerHTML;   // the "select a task" state, restored on clear

// tasks.md is repo content, but it still reaches innerHTML — escape rather than trust it
function h(s){ return String(s).replace(/[&<>"]/g, function(c){
  return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

function row(id){
  var t = BY[id]; if(!t) return '<div class="dep">' + h(id) + ' <span class="st">unknown</span></div>';
  return '<button class="dep" data-goto="' + h(id) + '">' + h(id) +
    '<span class="st ' + h(t.status) + '">' + h(t.status) + '</span></button>';
}
function paint(){
  document.querySelectorAll('.card').forEach(function(c){
    c.classList.remove('selected','dim','rel-up','rel-down');
    if(!sel) return;
    var id = c.dataset.id, t = BY[sel];
    if(id === sel) c.classList.add('selected');
    else if(t.deps.indexOf(id) > -1) c.classList.add('rel-up');
    else if(t.dependents.indexOf(id) > -1) c.classList.add('rel-down');
    else c.classList.add('dim');
  });
}
function clear(){ sel = null; box.innerHTML = EMPTY; paint(); }

function show(id){
  sel = id; var t = BY[id];
  box.innerHTML = '<button class="clear" data-clear="1" title="Clear selection (Esc)">&times;</button>' +
    '<h2>' + h(t.id) + '</h2><div class="sub">' + h(t.desc) + '</div>' +
    (t.file ? '<div class="file">' + h(t.file) + '</div>' : '') +
    '<h3>Blocked by (' + t.deps.length + ')</h3>' +
    (t.deps.length ? t.deps.map(row).join('') : '<div class="empty">nothing — this can start now</div>') +
    '<h3>Unblocks (' + t.dependents.length + ')</h3>' +
    (t.dependents.length ? t.dependents.map(row).join('') : '<div class="empty">nothing downstream</div>') +
    '<div class="note">Completion lives in <strong>tasks.md</strong>. Tick the checkbox there and run <code>bun run board</code>.</div>';
  paint();
}
document.addEventListener('click', function(e){
  if(e.target.closest('[data-clear]')){ clear(); return; }
  var go = e.target.closest('[data-goto]'); if(go){ show(go.dataset.goto); return; }
  var c = e.target.closest('.card');
  if(c){ c.dataset.id === sel ? clear() : show(c.dataset.id); return; }
  if(!e.target.closest('aside')) clear();          // click anywhere outside deselects
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape'){ clear(); return; }
  if(e.key !== 'Enter' && e.key !== ' ') return;
  var c = document.activeElement.closest && document.activeElement.closest('.card');
  if(c){ e.preventDefault(); show(c.dataset.id); }
});
</script></body></html>
`
}

// ── run ────────────────────────────────────────────────────────────────────────
if (!existsSync(PHASES)) {
  if (!quiet) console.error('board: no phases/ directory')
  process.exit(quiet ? 0 : 1)
}

let failed = false
const nextOnly = process.argv.includes('--next')
const dirs = readdirSync(PHASES, { withFileTypes: true }).filter(
  (d) => d.isDirectory() && existsSync(join(PHASES, d.name, 'tasks.md')),
)

// Which task ids already have a branch. Derived from git refs — nobody types this, so it cannot be
// stale. Safe to bake into the board because the board is gitignored — nothing committed, nothing
// to conflict on. Regenerate and it is current.
function branchState() {
  const list = (args) => {
    const r = spawnSync('git', args, { encoding: 'utf8' })
    return r.status === 0 && r.stdout
      ? r.stdout
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  }
  const base = ['dev', 'main', 'master'].find(
    (b) => spawnSync('git', ['rev-parse', '--verify', b], { encoding: 'utf8' }).status === 0,
  )
  // A branch already merged into the base is history, not work in flight. Checking merge rather than
  // mere existence matters because branches are often not deleted after merging — without this,
  // every finished ticket would look permanently unlanded.
  const merged = new Set(
    base ? list(['branch', '--merged', base, '--format=%(refname:short)']) : [],
  )

  const map = new Map() // task id -> 'open' | 'merged'
  for (const ref of list([
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/heads',
    'refs/remotes',
  ])) {
    const bare = ref.replace(/^origin\//, '')
    const m = bare.match(/^(T\d{3,}|[A-Z][A-Z0-9]+-\d+)[-/]/)
    if (!m) continue
    const state = merged.has(bare) || merged.has(ref) ? 'merged' : 'open'
    if (state === 'open' || !map.has(m[1])) map.set(m[1], state) // any unmerged ref wins
  }
  return map
}
const taskIdsWithBranches = () =>
  new Set([...branchState()].filter(([, s]) => s === 'open').map(([i]) => i))

// --next: what can actually be started right now, across every phase.
// This is what makes [P] worth marking — several sessions can take different ready tasks at once.
if (nextOnly) {
  // Any branch at all, merged or not — see statusOf: a branch created moments ago has no commits
  // beyond the base, and filtering to unmerged made an actively-worked ticket read as ready.
  const taken = new Set(branchState().keys())
  const ready = []
  const inProgress = []
  let blocked = 0
  let done = 0
  for (const d of dirs) {
    const { tasks } = parse(readFileSync(join(PHASES, d.name, 'tasks.md'), 'utf8'))
    const by = Object.fromEntries(tasks.map((t) => [t.id, t]))
    for (const t of tasks) {
      const depsDone = t.deps.every((x) => !by[x] || by[x].done)
      if (t.done) done++
      else if (!depsDone) blocked++
      else (taken.has(t.id) ? inProgress : ready).push({ ...t, phaseDir: d.name })
    }
  }

  const line = (t) => {
    const tags = [t.parallel ? 'P' : '', t.story || '', t.test ? 'TEST' : '']
      .filter(Boolean)
      .join(' ')
    console.log(`  ${t.id}${tags ? `  [${tags}]` : ''}  ${t.desc.slice(0, 88)}`)
    console.log(`      ${t.phaseDir}${t.file ? ` · ${t.file}` : ''}`)
  }

  console.log(
    `next: ${ready.length} ready · ${inProgress.length} in progress · ${blocked} blocked · ${done} done\n`,
  )

  if (inProgress.length) {
    console.log('  IN PROGRESS — a branch exists, someone is on it')
    inProgress.forEach(line)
    console.log('')
  }

  if (!ready.length) {
    console.log(
      blocked || inProgress.length
        ? '  Nothing free to start. Everything left is blocked or already taken.'
        : '  Everything is done.',
    )
    process.exit(0)
  }

  console.log('  READY — dependencies satisfied, no branch yet')
  ready.forEach(line)

  const par = ready.filter((t) => t.parallel).length
  console.log(
    `\n  Start one with:  /ticket ${ready[0].id}` +
      (par > 1
        ? `\n  ${par} of these are [P] — different sessions can take them at the same time.`
        : ''),
  )
  process.exit(0)
}

for (const d of dirs) {
  const dir = join(PHASES, d.name)
  const { phases, tasks } = parse(readFileSync(join(dir, 'tasks.md'), 'utf8'))

  const dupes = tasks.map((t) => t.id).filter((id, i, a) => a.indexOf(id) !== i)
  if (dupes.length) {
    console.error(`board: ${d.name} — duplicate task ids: ${[...new Set(dupes)].join(', ')}`)
    failed = true
    continue
  }
  const ids = new Set(tasks.map((t) => t.id))
  const unknown = tasks.flatMap((t) => t.deps.filter((x) => !ids.has(x)).map((x) => `${t.id}→${x}`))
  if (unknown.length) {
    console.error(
      `board: ${d.name} — dependency on a task that does not exist: ${unknown.join(', ')}`,
    )
    failed = true
    continue
  }

  // ONE board, and it is GITIGNORED.
  //
  // It was briefly two — a committed deterministic copy and a live one. The committed copy justified
  // itself as "viewable on GitHub", which is false: GitHub renders .html in a repo view as source.
  // So it bought nothing that regenerating does not, and cost a CI staleness check that existed only
  // because the file was committed, plus a merge conflict every time two tickets ran at once.
  //
  // What is worth checking is the GRAPH, not the artefact — and that happens on every run, above,
  // in pre-commit and in CI.
  writeFileSync(
    join(dir, 'dag-board.html'),
    render(d.name, phases, tasks, taskIdsWithBranches(), new Set(branchState().keys())),
  )

  const rel = `phases/${d.name}/dag-board.html`
  written.push({ name: d.name, rel, open: tasks.filter((t) => !t.done).length })

  if (!quiet) {
    const done = tasks.filter((t) => t.done).length
    const wip = tasks.filter((t) => !t.done && taskIdsWithBranches().has(t.id)).length
    console.log(
      `board: ${d.name} — ${tasks.length} tasks, ${done} done${wip ? `, ${wip} in progress` : ''}` +
        `\n       ${rel}`,
    )
  }
}

if (!dirs.length && !quiet) console.log('board: no phases/*/tasks.md yet')

// ── open it ────────────────────────────────────────────────────────────────────
// The file is gitignored and regenerated, which is right — but it left "how do I actually look at
// this" as an unwritten step, and an unwritten step in a starter is one somebody gets wrong. Printing
// a bare filename with no directory made it worse once there were two phases.
//
// `--open` with no argument picks the phase with unfinished work, because that is the one being
// worked. Pass any substring of a phase name to override.
if (openFlag && written.length) {
  const want = process.argv[process.argv.indexOf('--open') + 1]
  const match = want && !want.startsWith('--') ? written.filter((w) => w.name.includes(want)) : []

  if (want && !want.startsWith('--') && !match.length) {
    console.error(
      `board: no phase matching "${want}" — have ${written.map((w) => w.name).join(', ')}`,
    )
    process.exit(1)
  }

  const pick = match[0] || written.find((w) => w.open) || written[written.length - 1]
  spawnSync(OPENER, [join(ROOT, pick.rel)], { stdio: 'ignore' })
  if (!quiet) console.log(`\n  opening ${pick.rel}`)
}

process.exit(failed ? 1 : 0)
