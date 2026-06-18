import type { RoutineDef, RoutineStep, HabitStatus } from './routineTypes'

export function isStepScheduledOnDay(step: RoutineStep, dayOfWeek: number): boolean {
  return step.scheduledDays.length === 0 || step.scheduledDays.includes(dayOfWeek)
}

export function getStepStatus(
  step: RoutineStep,
  dayOfWeek: number,
  isCompleted: boolean,
  isFailed: boolean,
): HabitStatus {
  const isApplicable = isStepScheduledOnDay(step, dayOfWeek)

  if (!isApplicable) return 'not_applicable'
  if (isCompleted) return 'done'
  if (isFailed) return 'failed'
  return 'pending'
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