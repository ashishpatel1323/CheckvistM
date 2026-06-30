#!/usr/bin/env node
/**
 * One-time cleanup: delete Routine 1's old per-routine-per-date [ROUTINE_LOG]
 * tasks from the hidden "⚙️ Checkvist Routines" list. Routine 2 reads only
 * [ROUTINE_DEF] (definitions) and [HABIT_LOG] (per-habit history), so removing
 * [ROUTINE_LOG] does NOT affect Routine 2. Run AFTER migrateRoutine1to2.mjs.
 *
 * Usage:
 *   CV_USERNAME=you@example.com CV_REMOTE_KEY=yourkey node scripts/deleteRoutine1Logs.mjs [--dry-run]
 */

const BASE = 'https://checkvist.com'
const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_LOG_PREFIX = '[ROUTINE_LOG]'

const DRY_RUN = process.argv.includes('--dry-run')
const USERNAME = process.env.CV_USERNAME
const REMOTE_KEY = process.env.CV_REMOTE_KEY

if (!USERNAME || !REMOTE_KEY) {
  console.error('Missing credentials. Set CV_USERNAME and CV_REMOTE_KEY env vars.')
  process.exit(1)
}

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
  if (!data.token) throw new Error(`login returned no token`)
  TOKEN = data.token
}

async function api(path, { method = 'GET' } = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}${path}${sep}token=${encodeURIComponent(TOKEN)}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  // DELETE may return empty body
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function main() {
  console.log(`[cleanup] ${DRY_RUN ? 'DRY RUN — no deletes' : 'LIVE — will delete [ROUTINE_LOG] tasks'}`)
  await login()
  console.log('[cleanup] logged in')

  const lists = await api('/checklists.json')
  const list = lists.find((l) => l.name === SYSTEM_LIST_NAME)
  if (!list) { console.error(`[cleanup] list not found. Nothing to do.`); process.exit(1) }

  const tasks = await api(`/checklists/${list.id}/tasks.json`)
  const logs = tasks.filter((t) => (t.content ?? '').startsWith(ROUTINE_LOG_PREFIX))
  console.log(`[cleanup] found ${logs.length} [ROUTINE_LOG] tasks`)

  let deleted = 0
  for (const t of logs) {
    if (DRY_RUN) { deleted++; continue }
    await api(`/checklists/${list.id}/tasks/${t.id}.json`, { method: 'DELETE' })
    deleted++
  }
  console.log(`[cleanup] done. deleted=${deleted}${DRY_RUN ? ' (dry run — nothing deleted)' : ''}`)
}

main().catch((e) => { console.error('[cleanup] FAILED:', e.message); process.exit(1) })
