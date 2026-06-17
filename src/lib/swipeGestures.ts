import { Gesture } from 'react-native-gesture-handler'
import { useSharedValue } from 'react-native-reanimated'

/**
 * Swipe gesture configuration for mobile UX
 * - Swipe right: Defer/snooze to tomorrow
 * - Swipe left: Mark done/complete
 */

export const SWIPE_THRESHOLD = 50 // pixels
export const SWIPE_VELOCITY_THRESHOLD = 200 // pixels per second

export interface SwipeActionHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}

export function createSwipeGesture(handlers: SwipeActionHandlers) {
  const startX = useSharedValue(0)

  const gesture = Gesture.Pan()
    .onStart((e) => {
      startX.value = e.x
    })
    .onEnd((e) => {
      const distance = e.x - startX.value
      const velocity = e.velocityX

      // Swipe right (velocity or distance)
      if ((distance > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD) && handlers.onSwipeRight) {
        handlers.onSwipeRight()
      }

      // Swipe left (velocity or distance)
      if ((distance < -SWIPE_THRESHOLD || velocity < -SWIPE_VELOCITY_THRESHOLD) && handlers.onSwipeLeft) {
        handlers.onSwipeLeft()
      }
    })

  return gesture
}

/**
 * Simpler swipe detection for hooks
 * Returns { isLeft, isRight } based on horizontal distance
 */
export function detectSwipe(startX: number, endX: number): { isLeft: boolean; isRight: boolean } {
  const distance = endX - startX
  return {
    isLeft: distance < -SWIPE_THRESHOLD,
    isRight: distance > SWIPE_THRESHOLD,
  }
}
