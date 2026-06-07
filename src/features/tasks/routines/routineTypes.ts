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

export interface CheckinLog {
  routineTaskId: number
  date: string  // YYYY-MM-DD
  completedStepIds: string[]
  durationSec: number
  systemTaskId?: number
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

