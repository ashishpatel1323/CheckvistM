#!/usr/bin/env node
/**
 * One-time migration: copy Routine 1 history → Routine 2 (per-habit).
 *
 * Routine 1 stores one task per routine per date:
 *   [ROUTINE_LOG] <name> | <YYYY-MM-DD> | steps=a,b dur=NN stimes=a@08:15,... failed=c
 * Routine 2 stores one task per habit:
 *   [HABIT_LOG] <habitId> ||| {"v":2,"done":[...],"failed":[...],"times":{...}}
 *
 * Both live in the same hidden list "⚙️ Checkvist Routines" and share step ids,
 * so this regroups (routine,date)→steps into habit→dates. Replace semantics:
 * an existing [HABIT_LOG] for a habit is overwritten. Read-only on [ROUTINE_LOG].
 *
 * Usage:
 *   CV_USERNAME=you@example.com CV_REMOTE_KEY=yourkey node scripts/migrateRoutine1to2.mjs [--dry-run]
 *
 * Get the remote key from Checkvist → Settings → "OpenAPI / remote key".
 */

const BASE = 'https://checkvist.com'
const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_LOG_PREFIX = '[ROUTINE_LOG]'
const HABIT_LOG_PREFIX = '[HABIT_LOG]'
const SEP = ' ||| '

const DRY_RUN = process.argv.includes('--dry-run')
const USERNAME = process.env.CV_USERNAME
const REMOTE_KEY = process.env.CV_REMOTE_KEY

if (!USERNAME || !REMOTE_KEY) {
  console.error('Missing credentials. Set CV_USERNAME and CV_REMOTE_KEY env vars.')
  console.error('  CV_USERNAME=you@example.com CV_REMOTE_KEY=yourkey node scripts/migrateRoutine1to2.mjs [--dry-run]')
  process.exit(1)
}

// ─── REST helpers ───────────────────────────────────────────────────────────
let TOKEN = null

async function login() {
  const body = new URLSearchParams({ username: USERNAME, remote_key: REMOTE_KEY })
  const res = await fetch(`${BASE}/auth/login.json?version=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (!data.token) throw new Error(`login returned no token: ${JSON.stringify(data)}`)
  TOKEN = data.token
}

async function api(path, { method = 'GET', json } = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}token=${encodeURIComponent(TOKEN)}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: json ? JSON.stringify(json) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

// ─── Parsing (mirrors decodeCheckin) ─────────────────────────────────────────
function parseRoutineLog(content) {
  const dateM = content.match(/\| (\d{4}-\d{2}-\d{2}) \|/)
  if (!dateM) return null
  const stepsM = content.match(/steps=([^\s|]*)/)
  const stimesM = content.match(/stimes=(\S+)/)
  const failedM = content.match(/failed=(\S+)/)

  const completedStepIds = stepsM?.[1] ? stepsM[1].split(',').filter(Boolean) : []
  const failedStepIds = failedM?.[1] ? failedM[1].split(',').filter(Boolean) : []
  const times = {}
  if (stimesM?.[1]) {
    for (const pair of stimesM[1].split(',')) {
      const at = pair.lastIndexOf('@')
      if (at > 0) times[pair.slice(0, at)] = pair.slice(at + 1)
    }
  }
  return { date: dateM[1], completedStepIds, failedStepIds, times }
}

function parseHabitLogId(content) {
  const rest = content.slice(HABIT_LOG_PREFIX.length + 1)
  const sepIdx = rest.indexOf(SEP)
  if (sepIdx === -1) return null
  let key = rest.slice(0, sepIdx).trim()
  const colon = key.indexOf(':') // legacy v1 "rid:hid"
  if (colon !== -1) key = key.slice(colon + 1)
  return key || null
}

function encodeHabitLog(habitId, done, failed, times) {
  const payload = { v: 2, done, failed, times }
  return `${HABIT_LOG_PREFIX} ${habitId}${SEP}${JSON.stringify(payload)}`
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[migrate] ${DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — will write to Checkvist'}`)
  await login()
  console.log('[migrate] logged in')

  const lists = await api('/checklists.json')
  const list = lists.find((l) => l.name === SYSTEM_LIST_NAME)
  if (!list) {
    console.error(`[migrate] list "${SYSTEM_LIST_NAME}" not found. Nothing to do.`)
    process.exit(1)
  }
  console.log(`[migrate] list "${SYSTEM_LIST_NAME}" id=${list.id}`)

  const tasks = await api(`/checklists/${list.id}/tasks.json`)

  // habitId → { done:Set, failed:Set, times:{} }
  const habits = new Map()
  const existingHabitTaskId = new Map() // habitId → taskId of current [HABIT_LOG]
  let routineLogCount = 0

  const getHabit = (id) => {
    let h = habits.get(id)
    if (!h) { h = { done: new Set(), failed: new Set(), times: {} }; habits.set(id, h) }
    return h
  }

  for (const t of tasks) {
    const c = t.content ?? ''
    if (c.startsWith(ROUTINE_LOG_PREFIX)) {
      const log = parseRoutineLog(c)
      if (!log) continue
      routineLogCount++
      for (const id of log.completedStepIds) {
        const h = getHabit(id)
        h.done.add(log.date)
        if (log.times[id]) h.times[log.date] = log.times[id]
      }
      for (const id of log.failedStepIds) {
        getHabit(id).failed.add(log.date)
      }
    } else if (c.startsWith(HABIT_LOG_PREFIX)) {
      const id = parseHabitLogId(c)
      if (id) existingHabitTaskId.set(id, t.id)
    }
  }

  console.log(`[migrate] parsed ${routineLogCount} [ROUTINE_LOG] entries → ${habits.size} habits with history`)

  let created = 0, updated = 0
  for (const [habitId, h] of habits) {
    const done = [...h.done].sort()
    const failed = [...h.failed].sort()
    const content = encodeHabitLog(habitId, done, failed, h.times)
    const existingId = existingHabitTaskId.get(habitId)

    console.log(
      `  ${existingId ? 'update' : 'create'} habit ${habitId}: ` +
      `${done.length} done, ${failed.length} failed, ${Object.keys(h.times).length} times`
    )

    if (DRY_RUN) { existingId ? updated++ : created++; continue }

    if (existingId) {
      await api(`/checklists/${list.id}/tasks/${existingId}.json`, { method: 'PUT', json: { task: { content } } })
      updated++
    } else {
      await api(`/checklists/${list.id}/tasks.json`, { method: 'POST', json: { task: { content } } })
      created++
    }
  }

  console.log(`[migrate] done. created=${created} updated=${updated}${DRY_RUN ? ' (dry run — nothing written)' : ''}`)
}

main().catch((e) => { console.error('[migrate] FAILED:', e.message); process.exit(1) })
