import { useRef, useCallback, useMemo } from 'react'
import { View, Platform } from 'react-native'
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import { useSwipeContext } from './SwipeContext'
import { TaskSwipeActions, ACTION_WIDTH } from './TaskSwipeActions'

const SWIPE_OPEN_THRESHOLD = 20 // percent of swipe action width to trigger snap open
const MAX_SWIPE_DISTANCE = ACTION_WIDTH * 3

interface SwipeableRowProps {
  taskId: number
  children: React.ReactNode
  onSwipeOpen?: () => void
  onSchedule?: () => void
  onSnooze?: () => void
  onMove?: () => void
  disabled?: boolean
  additionalGesture?: GestureType
}

export function SwipeableRow({
  taskId,
  children,
  onSwipeOpen,
  onSchedule,
  onSnooze,
  onMove,
  disabled = false,
  additionalGesture,
}: SwipeableRowProps) {
  const { openSwipeId, setOpenSwipeId, closeOtherSwipes } = useSwipeContext()
  const startX = useRef(0)
  const isSwipeActive = useRef(false)

  const translateX = useSharedValue(0)
  const isOpen = openSwipeId === taskId

  // Close swipe by updating shared value
  const closeSwipe = useCallback(() => {
    translateX.value = withSpring(0, {
      damping: 15,
      mass: 1,
      stiffness: 100,
    })
    setOpenSwipeId(null)
  }, [translateX, setOpenSwipeId])

  // Open swipe
  const openSwipe = useCallback(() => {
    closeOtherSwipes(taskId)
    translateX.value = withSpring(-MAX_SWIPE_DISTANCE, {
      damping: 15,
      mass: 1,
      stiffness: 100,
    })
    setOpenSwipeId(taskId)
    onSwipeOpen?.()
  }, [taskId, closeOtherSwipes, setOpenSwipeId, onSwipeOpen, translateX])

  // Pan gesture for swiping
  const panGesture = useMemo(
    () =>
      Platform.OS !== 'web' && !disabled
        ? Gesture.Pan()
            .activeOffsetX([-5, 5])
            .failOffsetY([-5, 5])
            .onStart(() => {
              isSwipeActive.current = true
            })
            .onUpdate((e) => {
              if (!isSwipeActive.current) return
              let newX = e.translationX
              // Constrain swiping
              if (newX > 0) {
                newX = 0
              }
              if (newX < -MAX_SWIPE_DISTANCE) {
                newX = -MAX_SWIPE_DISTANCE
              }
              translateX.value = newX
            })
            .onEnd((e) => {
              isSwipeActive.current = false
              const threshold = (MAX_SWIPE_DISTANCE * SWIPE_OPEN_THRESHOLD) / 100

              // Snap based on velocity or distance
              if (
                e.velocityX < -500 ||
                (e.translationX < -threshold && e.velocityX >= -500)
              ) {
                runOnJS(openSwipe)()
              } else if (e.velocityX > 500 || e.translationX > -threshold) {
                runOnJS(closeSwipe)()
              } else {
                // Default to open if swiped far enough
                if (e.translationX < -threshold) {
                  runOnJS(openSwipe)()
                } else {
                  runOnJS(closeSwipe)()
                }
              }
            })
        : null,
    [disabled, openSwipe, closeSwipe, translateX]
  )

  const composedGesture = useMemo(() => {
    if (!panGesture) return additionalGesture || null
    if (!additionalGesture) return panGesture
    return Gesture.Simultaneous(panGesture, additionalGesture)
  }, [panGesture, additionalGesture])

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    }
  })

  const handleSchedule = useCallback(() => {
    closeSwipe()
    onSchedule?.()
  }, [closeSwipe, onSchedule])

  const handleSnooze = useCallback(() => {
    closeSwipe()
    onSnooze?.()
  }, [closeSwipe, onSnooze])

  const handleMove = useCallback(() => {
    closeSwipe()
    onMove?.()
  }, [closeSwipe, onMove])

  // Close swipe when outside row is tapped
  const handleContentPress = useCallback(() => {
    if (isOpen) {
      closeSwipe()
    }
  }, [isOpen, closeSwipe])

  const gestureHandler = composedGesture ? (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[animatedStyle, { flex: 1 }]}>
        <View onTouchEnd={handleContentPress} style={{ flex: 1 }}>
          {children}
        </View>
      </Animated.View>
    </GestureDetector>
  ) : (
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  )

  return (
    <View style={{ overflow: 'hidden' }}>
      <TaskSwipeActions
        onSchedule={handleSchedule}
        onSnooze={handleSnooze}
        onMove={handleMove}
      />
      {gestureHandler}
    </View>
  )
}
