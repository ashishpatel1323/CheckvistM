#!/usr/bin/env node
/**
 * One-time script: seeds 5 daily habit routines into the Checkvist
 * "⚙️ Checkvist Routines" system list, using the same encoding format
 * the app uses (encodeRoutineDef from useRoutineSystem.ts).
 *
 * Usage:
 *   node scripts/seedRoutines.mjs <email> <remote_key>
 *
 * Find your remote_key at: https://checkvist.com/auth/profile
 */

const BASE = 'https://checkvist.com'
const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_DEF_PREFIX = '[ROUTINE_DEF]'
const DEF_SEP = ' ||| '

// ── helpers ───────────────────────────────────────────────────────────────────

function encodeRoutineDef(def) {
  const payload = {
    v: 1,
    steps: def.steps,
    trigger: def.trigger,
    color: def.color,
    scheduledDays: def.scheduledDays,
    isFlexible: def.isFlexible,
    strictness: def.strictness,
  }
  return `${ROUTINE_DEF_PREFIX} ${def.name}${DEF_SEP}${JSON.stringify(payload)}`
}

async function api(method, path, token, body) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}token=${token}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

async function login(username, remoteKey) {
  const body = new URLSearchParams({ username, remote_key: remoteKey })
  const res = await fetch(`${BASE}/auth/login.json?version=2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.token
}

// ── routine definitions ───────────────────────────────────────────────────────

const ROUTINES = [
  {
    name: 'Morning Before Gym',
    trigger: 'Before gym',
    color: 'blue',
    scheduledDays: [1, 2, 3, 4, 5, 6, 0],
    isFlexible: false,
    strictness: 'lenient',
    steps: [
      { id: 'mbg1', name: 'Eat 1/2',                          emoji: '🍽️',  durationMin: 5,  optional: false },
      { id: 'mbg2', name: 'Sony WU / Bed',                    emoji: '🎵',  durationMin: 3,  optional: true  },
      { id: 'mbg3', name: 'Drink 1/2',                        emoji: '💧',  durationMin: 2,  optional: false },
      { id: 'mbg4', name: 'Washroom / FW',                    emoji: '🚿',  durationMin: 10, optional: false },
      { id: 'mbg5', name: 'Gym Bag',                          emoji: '🎒',  durationMin: 3,  optional: false },
      { id: 'mbg6', name: 'Meditation',                       emoji: '🧘',  durationMin: 10, optional: false },
      { id: 'mbg7', name: 'Pull up',                          emoji: '💪',  durationMin: 5,  optional: false },
      { id: 'mbg8', name: 'Charge – Watch, earphone, phone',  emoji: '🔋',  durationMin: 2,  optional: false },
    ],
  },
  {
    name: 'After Gym Before Office',
    trigger: 'After gym',
    color: 'green',
    scheduledDays: [1, 2, 3, 4, 5],
    isFlexible: false,
    strictness: 'lenient',
    steps: [
      { id: 'agbo1', name: 'BF (Breakfast)',                   emoji: '🥗',  durationMin: 15, optional: false },
      { id: 'agbo2', name: 'Protein, Creatine, Fish oil',      emoji: '💊',  durationMin: 2,  optional: false },
      { id: 'agbo3', name: 'Walk 300–500',                     emoji: '🚶',  durationMin: 8,  optional: false },
      { id: 'agbo4', name: 'Leave for office',                 emoji: '🏢',  durationMin: 2,  optional: false },
      { id: 'agbo5', name: 'Bath',                             emoji: '🛁',  durationMin: 15, optional: false },
      { id: 'agbo6', name: 'Call dad',                         emoji: '📞',  durationMin: 5,  optional: false },
    ],
  },
  {
    name: 'Office Reach',
    trigger: 'Reaching office',
    color: 'purple',
    scheduledDays: [1, 2, 3, 4, 5],
    isFlexible: false,
    strictness: 'lenient',
    steps: [
      { id: 'or1', name: 'Reach 5k steps',                    emoji: '👟',  durationMin: 0,  optional: false },
      { id: 'or2', name: 'Calendar review',                    emoji: '📅',  durationMin: 5,  optional: false },
      { id: 'or3', name: 'Email',                              emoji: '📧',  durationMin: 5,  optional: false },
      { id: 'or4', name: 'Music on',                           emoji: '🎧',  durationMin: 1,  optional: true  },
      { id: 'or5', name: 'Water 1',                            emoji: '💧',  durationMin: 1,  optional: false },
      { id: 'or6', name: 'Spoon for Fruits',                   emoji: '🥄',  durationMin: 1,  optional: true  },
      { id: 'or7', name: 'Egg',                                emoji: '🥚',  durationMin: 5,  optional: false },
      { id: 'or8', name: 'Tick tick for today',                emoji: '✅',  durationMin: 5,  optional: false },
      { id: 'or9', name: 'Charge – Watch, earphone, phone',    emoji: '🔋',  durationMin: 2,  optional: false },
    ],
  },
  {
    name: 'Post Lunch',
    trigger: 'After lunch',
    color: 'teal',
    scheduledDays: [1, 2, 3, 4, 5],
    isFlexible: false,
    strictness: 'lenient',
    steps: [
      { id: 'pl1', name: 'Lunch',                              emoji: '🍱',  durationMin: 20, optional: false },
      { id: 'pl2', name: 'Todoist review',                     emoji: '📋',  durationMin: 5,  optional: false },
      { id: 'pl3', name: 'Calendar',                           emoji: '📅',  durationMin: 3,  optional: false },
      { id: 'pl4', name: 'Walk 1000',                          emoji: '🚶',  durationMin: 12, optional: false },
      { id: 'pl5', name: 'Emails',                             emoji: '📧',  durationMin: 5,  optional: false },
      { id: 'pl6', name: 'Green tea',                          emoji: '🍵',  durationMin: 2,  optional: false },
      { id: 'pl7', name: 'Water 2',                            emoji: '💧',  durationMin: 1,  optional: false },
    ],
  },
  {
    name: 'Post Reaching Home',
    trigger: 'After reaching home',
    color: 'pink',
    scheduledDays: [1, 2, 3, 4, 5, 6, 0],
    isFlexible: false,
    strictness: 'lenient',
    steps: [
      { id: 'prh1', name: 'Charge – Watch, earphone, phone',  emoji: '🔋',  durationMin: 2,  optional: false },
      { id: 'prh2', name: 'Clean up',                         emoji: '🧹',  durationMin: 10, optional: false },
    ],
  },
]

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [,, email, remoteKey] = process.argv
  if (!email || !remoteKey) {
    console.error('Usage: node scripts/seedRoutines.mjs <email> <remote_key>')
    console.error('Find your remote_key at: https://checkvist.com/auth/profile')
    process.exit(1)
  }

  console.log('Logging in…')
  const token = await login(email, remoteKey)
  console.log('✓ Logged in')

  // Find or create system list
  const lists = await api('GET', '/checklists.json', token)
  let systemList = lists.find(l => l.name === SYSTEM_LIST_NAME)
  if (!systemList) {
    console.log(`Creating system list "${SYSTEM_LIST_NAME}"…`)
    systemList = await api('POST', '/checklists.json', token, { checklist: { name: SYSTEM_LIST_NAME } })
    console.log(`✓ Created list id=${systemList.id}`)
  } else {
    console.log(`✓ Found system list id=${systemList.id}`)
  }

  // Check for existing routines to avoid duplicates
  const existing = await api('GET', `/checklists/${systemList.id}/tasks.json`, token)
  const existingNames = new Set(
    existing
      .filter(t => t.content.startsWith(ROUTINE_DEF_PREFIX))
      .map(t => {
        const rest = t.content.slice(ROUTINE_DEF_PREFIX.length + 1)
        return rest.split(DEF_SEP)[0].trim()
      })
  )

  for (const def of ROUTINES) {
    if (existingNames.has(def.name)) {
      console.log(`  ⏭  Skipping "${def.name}" (already exists)`)
      continue
    }
    const content = encodeRoutineDef(def)
    const task = await api('POST', `/checklists/${systemList.id}/tasks.json`, token, { task: { content } })
    console.log(`  ✓ Created "${def.name}" → task id=${task.id}`)
  }

  console.log('\nDone! Open the app and switch to the Routines tab to see them.')
}

main().catch(e => { console.error(e.message); process.exit(1) })
