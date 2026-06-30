/**
 * Tests for routine scheduling helpers
 * Run with: pnpm test src/features/tasks/routines/routineSchedule.test.ts
 */

import { describe, it, expect } from 'vitest'
import { isStepScheduledOnDay, getPendingRoutineStepIds } from './routineSchedule'
import type { RoutineDef, RoutineStep } from './routineTypes'

function makeStep(id: string, scheduledDays: number[] = []): RoutineStep {
  return { id, name: id, emoji: '🏃', durationMin: 5, optional: false, scheduledDays }
}

function makeRoutine(steps: RoutineStep[]): RoutineDef {
  return { taskId: 1, name: 'Morning', color: 'blue', steps }
}

describe('isStepScheduledOnDay', () => {
  it('treats an empty scheduledDays list as every day', () => {
    expect(isStepScheduledOnDay(makeStep('a'), 0)).toBe(true)
    expect(isStepScheduledOnDay(makeStep('a'), 6)).toBe(true)
  })

  it('only matches the configured days otherwise', () => {
    const step = makeStep('a', [1, 3])
    expect(isStepScheduledOnDay(step, 1)).toBe(true)
    expect(isStepScheduledOnDay(step, 2)).toBe(false)
  })
})

describe('getPendingRoutineStepIds', () => {
  it('excludes completed steps', () => {
    const routine = makeRoutine([makeStep('a'), makeStep('b')])
    expect(getPendingRoutineStepIds(routine, ['a'], 0)).toEqual(['b'])
  })

  it('excludes failed steps so they do not count as pending', () => {
    const routine = makeRoutine([makeStep('a'), makeStep('b'), makeStep('c')])
    expect(getPendingRoutineStepIds(routine, ['a'], 0, ['b'])).toEqual(['c'])
  })

  it('excludes steps not scheduled for the given day', () => {
    const routine = makeRoutine([makeStep('a', [1]), makeStep('b', [2])])
    expect(getPendingRoutineStepIds(routine, [], 1)).toEqual(['a'])
  })

  it('returns nothing when all steps are either done or failed', () => {
    const routine = makeRoutine([makeStep('a'), makeStep('b')])
    expect(getPendingRoutineStepIds(routine, ['a'], 0, ['b'])).toEqual([])
  })
})
