/**
 * Intelligent Task Scheduling Algorithms
 * 
 * This module provides algorithms for intelligently assigning pending tasks
 * based on remaining time, priority, urgency, and other metadata.
 */

import type { TaskNode } from './taskTree'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Available time buckets for task classification (morning/afternoon/evening/night)
 */
export type TimeBucket = 'early' | 'morning' | 'afternoon' | 'evening' | 'night'

/**
 * Priority bucket classifications
 */
export type PriorityBucket = 'high' | 'medium' | 'low' | 'tbd'

/**
 * Result of task scheduling - which tasks fit in the remaining time
 */
export interface ScheduledTasksResult {
  /** Tasks that were scheduled within the available time */
  scheduled: TaskNode[]
  /** Tasks that couldn't fit in the remaining time */
  remaining: TaskNode[]
  /** Total time used by scheduled tasks in minutes */
  totalTimeUsed: number
  /** Remaining available time in minutes */
  remainingTime: number
}

/**
 * Options for task scheduling algorithms
 */
export interface ScheduleOptions {
  /** Available time window start (minutes from midnight) */
  startTime?: number
  /** Available time window end (minutes from midnight) */
  endTime?: number
  /** Maximum total time available in minutes */
  maxDuration?: number
  /** Weight for priority in scoring (0-1) */
  priorityWeight?: number
  /** Weight for urgency in scoring (0-1) */
  urgencyWeight?: number
  /** Weight for effort in scoring (0-1) */
  effortWeight?: number
  /** Weight for dependency in scoring (0-1) */
  dependencyWeight?: number
  /** Weight for engagement in scoring (0-1) */
  engagementWeight?: number
  /** Whether to prioritize tasks with NLP time hints */
  respectTimeHints?: boolean
}

// ============================================================================
// DEFAULT OPTIONS
// ============================================================================

const DEFAULT_OPTIONS: Required<ScheduleOptions> = {
  startTime: 540, // 9:00 AM
  endTime: 1320, // 10:00 PM
  maxDuration: 480, // 8 hours default
  priorityWeight: 0.35,
  urgencyWeight: 0.30,
  effortWeight: 0.20,
  dependencyWeight: 0.10,
  engagementWeight: 0.05,
  respectTimeHints: true,
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate urgency score based on due date
 */
export function calculateUrgencyScore(task: TaskNode): number {
  if (!task.due) return 0.5
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const dueDate = new Date(task.due)
  dueDate.setHours(0, 0, 0, 0)
  
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  
  if (diffDays < 0) return 1.5 // Overdue
  if (diffDays === 0) return 1.2 // Due today
  if (diffDays === 1) return 1.0 // Due tomorrow
  if (diffDays <= 7) return 0.7 // This week
  return 0.5 // Later
}

/**
 * Calculate priority score from 1-10 priority scale
 * Higher score = more important
 */
export function calculatePriorityScore(priority: number): number {
  // Convert 1-10 (1=highest) to 0.1-1.0 scale
  return (11 - priority) / 10
}

/**
 * Get task duration estimate in minutes
 */
export function getTaskDuration(task: TaskNode, defaultEstimate: (t: TaskNode) => number): number {
  if (task.duration?.minutes) {
    return task.duration.minutes
  }
  return Math.max(5, defaultEstimate(task))
}

/**
 * Calculate dependency weight based on child tasks
 */
export function calculateDependencyWeight(task: TaskNode): number {
  const childrenCount = task.children.length
  if (childrenCount === 0) return 0
  // Normalize: up to 0.5 for tasks with many children
  return Math.min(childrenCount / 10, 0.5)
}

/**
 * Calculate engagement score from comments and notes
 */
export function calculateEngagementScore(task: TaskNode): number {
  const comments = task.comments_count || 0
  const notes = task.notes_count || 0
  return (comments + notes) / 20 // Normalized to ~0-1 range
}

// ============================================================================
// WEIGHTED PRIORITY-EFFORT SCHEDULER
// ============================================================================

/**
 * Calculates a combined score for a task based on multiple factors.
 * Higher scores indicate tasks that should be scheduled first.
 * 
 * @param task - The task to score
 * @param options - Scoring options and weights
 * @returns A combined score (higher = should be scheduled earlier)
 */
export function calculateTaskScore(
  task: TaskNode,
  options: Partial<ScheduleOptions> = {}
): number {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  const priorityScore = calculatePriorityScore(task.priority)
  const urgencyScore = calculateUrgencyScore(task)
  const baseDuration = getTaskDuration(task, () => 30)
  
  // Effort score: shorter tasks get higher scores (easier to fit)
  const effortScore = Math.max(0, (1 - baseDuration / 120))
  
  const dependencyScore = calculateDependencyWeight(task)
  const engagementScore = calculateEngagementScore(task)
  
  // Combined formula
  const combined =
    (priorityScore * opts.priorityWeight) +
    (urgencyScore * opts.urgencyWeight) +
    (effortScore * opts.effortWeight) +
    (dependencyScore * opts.dependencyWeight) +
    (engagementScore * opts.engagementWeight)
  
  return combined
}

/**
 * Main scheduling algorithm using weighted priority-effort scoring.
 * Fits tasks into remaining time based on their combined scores.
 * 
 * @param tasks - Array of tasks to schedule
 * @param options - Scheduling options
 * @returns Object containing scheduled and remaining tasks
 */
export function scheduleTasksInRemainingTime(
  tasks: TaskNode[],
  options: Partial<ScheduleOptions> = {}
): ScheduledTasksResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Filter out already-scheduled tasks (those with slots)
  // For now, we'll just use all open tasks
  
  // Score all tasks
  const scoredTasks = tasks.map(task => ({
    task,
    score: calculateTaskScore(task, opts),
    duration: getTaskDuration(task, (t) => 30),
  }))
  
  // Sort by score descending
  scoredTasks.sort((a, b) => b.score - a.score)
  
  const scheduled: TaskNode[] = []
  const remaining: TaskNode[] = []
  let timeUsed = 0
  
  for (const { task, duration } of scoredTasks) {
    // Check if this task fits in remaining time
    if (timeUsed + duration <= opts.maxDuration) {
      scheduled.push(task)
      timeUsed += duration
    } else {
      remaining.push(task)
    }
  }
  
  return {
    scheduled,
    remaining,
    totalTimeUsed: timeUsed,
    remainingTime: opts.maxDuration - timeUsed,
  }
}

// ============================================================================
// KNAPSACK-BASED OPTIMIZER
// ============================================================================

/**
 * Solves the optimization problem: maximize total value within time budget.
 * Uses dynamic programming approach similar to knapsack problem.
 * 
 * @param tasks - Array of tasks with value/duration pairs
 * @param capacity - Maximum time available in minutes
 * @returns Indices of tasks to include
 */
export function knapsackOptimizer(
  tasks: TaskNode[],
  capacity: number,
  getScore: (task: TaskNode) => number
): { included: TaskNode[]; excluded: TaskNode[]; totalValue: number; totalWeight: number } {
  const n = tasks.length
  
  // Create DP table
  // dp[i][w] = max value using first i items with capacity w
  const dp: number[][] = Array(n + 1).fill(null).map(() => Array(Math.floor(capacity) + 1).fill(0))
  
  for (let i = 1; i <= n; i++) {
    const task = tasks[i - 1]
    const weight = getTaskDuration(task, (t) => 30)
    const value = getScore(task)
    
    for (let w = 0; w <= capacity; w++) {
      // Don't take item
      dp[i][w] = dp[i - 1][w]
      
      // Take item if it fits
      if (weight <= w && dp[i - 1][w - weight] + value > dp[i][w]) {
        dp[i][w] = dp[i - 1][w - weight] + value
      }
    }
  }
  
  // Backtrack to find included items
  const included: TaskNode[] = []
  const excluded: TaskNode[] = []
  let w = Math.floor(capacity)
  
  for (let i = n; i > 0 && w > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      included.push(tasks[i - 1])
      w -= getTaskDuration(tasks[i - 1], (t) => 30)
    } else {
      excluded.push(tasks[i - 1])
    }
  }
  
  return {
    included,
    excluded,
    totalValue: dp[n][Math.floor(capacity)],
    totalWeight: capacity - w,
  }
}

/**
 * Wrapper for knapsack optimizer using standard task scoring
 */
export function optimizeScheduleWithKnapsack(
  tasks: TaskNode[],
  maxDuration: number,
  options: Partial<ScheduleOptions> = {}
): ScheduledTasksResult {
  const result = knapsackOptimizer(
    tasks,
    maxDuration,
    (task) => calculateTaskScore(task, options)
  )
  
  // Recalculate actual time used
  const totalTimeUsed = result.included.reduce((sum, t) => sum + getTaskDuration(t, (t) => 30), 0)
  
  return {
    scheduled: result.included,
    remaining: result.excluded,
    totalTimeUsed,
    remainingTime: maxDuration - totalTimeUsed,
  }
}

// ============================================================================
// EARLIEST DEADLINE FIRST (EDF)
// ============================================================================

/**
 * Simple greedy algorithm prioritizing tasks with nearest due dates.
 * Best for deadline-driven scenarios.
 * 
 * @param tasks - Tasks to schedule
 * @param maxDuration - Maximum time available
 * @returns Scheduled and remaining tasks
 */
export function earliestDeadlineFirst(
  tasks: TaskNode[],
  maxDuration: number
): ScheduledTasksResult {
  const sortedTasks = [...tasks].sort((a, b) => {
    // No due date = farthest
    if (!a.due && !b.due) return a.position - b.position
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due.localeCompare(b.due)
  })
  
  const scheduled: TaskNode[] = []
  const remaining: TaskNode[] = []
  let timeUsed = 0
  
  for (const task of sortedTasks) {
    const duration = getTaskDuration(task, (t) => 30)
    if (timeUsed + duration <= maxDuration) {
      scheduled.push(task)
      timeUsed += duration
    } else {
      remaining.push(task)
    }
  }
  
  return {
    scheduled,
    remaining,
    totalTimeUsed: timeUsed,
    remainingTime: maxDuration - timeUsed,
  }
}

// ============================================================================
// TIME-HINT AWARE SCHEDULER
// ============================================================================

/**
 * Scheduler that respects NLP time hints from task content.
 * Tasks with time hints like "14:00" are placed at/haround those times.
 * 
 * @param tasks - Tasks to schedule
 * @param options - Scheduling options
 * @returns Schedule plan with time slots
 */
export function createTimeAwareSchedule(
  tasks: TaskNode[],
  options: Partial<ScheduleOptions> = {}
): Array<{ task: TaskNode; startTime: number; endTime: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // Separate hinted and non-hinted tasks
  const hintedTasks: Array<{ task: TaskNode; hintMinutes: number }> = []
  const unhintedTasks: TaskNode[] = []
  
  for (const task of tasks) {
    const hint = detectTimeHint(task.content)
    if (hint && opts.respectTimeHints) {
      hintedTasks.push({ task, hintMinutes: hint.startMinutes })
    } else {
      unhintedTasks.push(task)
    }
  }
  
  // Sort hinted tasks by their desired time
  hintedTasks.sort((a, b) => a.hintMinutes - b.hintMinutes)
  
  const schedule: Array<{ task: TaskNode; startTime: number; endTime: number }> = []
  let cursor = opts.startTime
  let timeUsed = 0
  
  // Place hinted tasks at their preferred times
  for (const { task, hintMinutes } of hintedTasks) {
    const duration = getTaskDuration(task, (t) => 30)
    
    if (timeUsed + duration > opts.maxDuration) break
    
    // Place at hint time or cursor, whichever is later
    const startTime = Math.max(cursor, opts.startTime, hintMinutes)
    const endTime = startTime + duration
    
    if (endTime <= opts.endTime) {
      schedule.push({ task, startTime, endTime })
      cursor = endTime
      timeUsed += duration
    }
  }
  
  // Place unhinted tasks sequentially
  const unhintedSorted = unhintedTasks.sort((a, b) => 
    calculateTaskScore(b, opts) - calculateTaskScore(a, opts)
  )
  
  for (const task of unhintedSorted) {
    const duration = getTaskDuration(task, (t) => 30)
    
    if (timeUsed + duration > opts.maxDuration) break
    
    schedule.push({
      task,
      startTime: cursor,
      endTime: cursor + duration,
    })
    cursor += duration
    timeUsed += duration
  }
  
  return schedule
}

// ============================================================================
// TIME HINT DETECTION (reuse existing utility)
// ============================================================================

/**
 * Reuse the existing NLP time hint detection utility
 */
import { detectTimeHint } from './nlpTimeSlot'

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * All available scheduling algorithms - choose based on your needs:
 * 
 * 1. scheduleTasksInRemainingTime - Weighted priority-effort scheduler (recommended)
 *    Best for general-purpose task scheduling with multi-factor scoring
 * 
 * 2. optimizeScheduleWithKnapsack - Knapsack-based optimizer
 *    Finds optimal subset of tasks that maximizes total value within time budget
 * 
 * 3. earliestDeadlineFirst - Deadline-driven scheduling
 *    Simple greedy algorithm prioritizing nearest due dates
 * 
 * 4. createTimeAwareSchedule - Time-hint aware scheduling
 *    Respects NLP-detected time preferences in task content
 * 
 * Usage example:
 * ```typescript
 * import { scheduleTasksInRemainingTime } from '@/lib/taskScheduling'
 * 
 * const result = scheduleTasksInRemainingTime(tasks, {
 *   maxDuration: 360, // 6 hours
 *   priorityWeight: 0.4,
 *   urgencyWeight: 0.3,
 * })
 * 
 * console.log('Scheduled:', result.scheduled.length, 'tasks')
 * console.log('Remaining:', result.remaining.length, 'tasks')
 * ```
 */
