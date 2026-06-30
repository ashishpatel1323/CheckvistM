import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onDesktopAction, type DesktopAction } from '@/platform/desktopBridge'
import { useExecuteLog } from '@/features/tasks/execute/useExecuteLog'
import { useRoutine2Store } from '@/features/tasks/routines2/useRoutine2Store'
import { useIdleTimer } from './useIdleTimer'

// Runs ONLY in the MacOSElectronApp main window (mounted alongside useMenuBarSync). It is the
// single executor of control actions the floating window dispatches: the floating window never
// touches the stores directly — it sends an action over IPC, and this maps it onto the same
// store methods GlobalTimerBar uses, so the two windows stay one source of truth. No-op off
// Electron (onDesktopAction returns a no-op unsubscribe).

export function useDesktopMainBridge(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    function handle(action: DesktopAction) {
      const ex = useExecuteLog.getState()
      const rt = useRoutine2Store.getState()
      const routinePaused = rt.activeTimer?.pausedAt != null

      switch (action.type) {
        case 'pause':
          if (ex.timerRunningKey) ex.pause()
          else if (rt.activeTimer && !routinePaused) rt.pauseTimer()
          break
        case 'play':
          // Only the routine timer can be resumed without a task key; execute has no
          // "resume last" without context, so play is a routine-resume.
          if (routinePaused) rt.resumeTimer()
          break
        case 'skip':
          if (ex.timerRunningKey) ex.markCompleted(ex.timerRunningKey)
          else if (rt.activeTimer) void rt.advanceStep('done')
          break
        case 'extend': {
          const mins = action.minutes
          if (ex.timerRunningKey) {
            const entry = ex.entries[ex.timerRunningKey]
            if (entry) ex.setEstimate(ex.timerRunningKey, entry.estimateMin + mins)
          } else if (rt.activeTimer) {
            rt.extendStep(mins * 60)
          } else {
            // Idle: extend the shared idle limit so the main bar and floating window stay in sync.
            useIdleTimer.getState().extend(mins * 60)
          }
          break
        }
        case 'tasksChanged':
          // Floating window created a task in its own React Query client; refresh ours.
          void queryClient.invalidateQueries({ queryKey: ['tasks'] })
          break
      }
    }

    return onDesktopAction(handle)
  }, [queryClient])
}
