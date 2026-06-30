export interface RoutineStep {
  id: string
  name: string
  emoji: string
  durationMin: number
  optional: boolean
  /** 0=Sun…6=Sat; empty means every day */
  scheduledDays: number[]
}

export type RoutineColor = 'blue' | 'green' | 'purple' | 'pink' | 'navy' | 'teal'

export interface RoutineDef {
  taskId: number
  name: string
  trigger: string
  color: RoutineColor
  steps: RoutineStep[]
}

export type HabitStatus = 'pending' | 'done' | 'failed' | 'not_applicable'

export interface CheckinLog {
  routineTaskId: number
  date: string  // YYYY-MM-DD
  completedStepIds: string[]
  /** Step ids explicitly marked as failed for this date (date-specific, not permanent on the step) */
  failedStepIds?: string[]
  durationSec: number
  /** stepId → HH:MM (24h) — wall-clock time when that individual step was marked done */
  stepCompletionTimes?: Record<string, string>
  systemTaskId?: number
}

export interface StepStatus {
  stepId: string
  status: HabitStatus
  date: string
}

/** Live routine-timer session state (shared by the routine store + the global timer bar). */
export interface ActiveTimer {
  routineTaskId: number
  /** Index into pendingStepIds (the filtered list of steps to run) */
  stepIndex: number
  /** Only the steps that are still pending (not yet succeeded today) */
  pendingStepIds: string[]
  stepStartedAt: number
  pausedAt: number | null
  stepElapsedSec: number
  completedStepIds: string[]
  skippedStepIds: string[]
  routineStartedAt: number
  totalElapsedSec: number
  /** Extra time added to the current step via "extend" while it overruns, in seconds */
  extensionSec: number
  /** stepId → HH:MM captured the moment each step's Done button was tapped this session */
  stepCompletionTimes: Record<string, string>
}

export const ROUTINE_COLORS: Record<RoutineColor, string> = {
  blue:   '#3B82F6',
  green:  '#22C55E',
  purple: '#A855F7',
  pink:   '#EC4899',
  navy:   '#3730A3',
  teal:   '#14B8A6',
}

export const ROUTINE_COLOR_OPTIONS: RoutineColor[] = ['blue', 'green', 'purple', 'pink', 'navy', 'teal']

