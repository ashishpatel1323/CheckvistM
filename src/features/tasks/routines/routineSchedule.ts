import type { RoutineDef, RoutineStep } from './routineTypes'

export function isStepScheduledOnDay(step: RoutineStep, dayOfWeek: number): boolean {
  return step.scheduledDays.length === 0 || step.scheduledDays.includes(dayOfWeek)
}

export function getPendingRoutineStepIds(
  routine: RoutineDef,
  completedStepIds: string[],
  dayOfWeek: number,
  failedStepIds: string[] = [],
): string[] {
  return routine.steps
    .filter((step) =>
      isStepScheduledOnDay(step, dayOfWeek) &&
      !completedStepIds.includes(step.id) &&
      !failedStepIds.includes(step.id),
    )
    .map((step) => step.id)
}