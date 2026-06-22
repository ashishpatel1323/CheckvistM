import { useCallback } from 'react'
import { View, Pressable } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Check, X as XIcon } from 'lucide-react-native'
import { format } from 'date-fns'
import { ROUTINE_COLORS } from './routineTypes'
import { getStepStatus } from './routineSchedule'
import { hapticSuccess, hapticWarning } from '@/lib/haptics'
import { BLUE, FAILURE_RED } from './RoutinesView'
import type { HabitRowProps } from './RoutinesView'
import { HabitRowContent } from './HabitRowContent'

const SWIPE_THRESHOLD = 50
const SWIPE_VELOCITY_THRESHOLD = 200
const MAX_DRAG = 96

/**
 * TickTick-style swipeable habit row, used only for the mobile single-date
 * "Day view" list (works in mobile form factor on both web and native —
 * react-native-gesture-handler / reanimated both support react-native-web).
 * Swipe right marks the step done, swipe left marks it failed; tapping the
 * row (without dragging) opens the habit detail view via onSelect.
 */
export function SwipeableHabitRow(props: HabitRowProps) {
  const { step, routine, visibleDates, onToggle, onMarkFailed, checkinsByDate, failedByDate, onSelect, isSelected } = props

  const accentColor = ROUTINE_COLORS[routine.color]
  const date = visibleDates[0]
  const ds = format(date, 'yyyy-MM-dd')
  const dayOfWeek = date.getDay()
  const isDone = (checkinsByDate[ds] ?? []).includes(step.id)
  const isFailed = (failedByDate[ds] ?? []).includes(step.id)
  const status = getStepStatus(step, dayOfWeek, isDone, isFailed)
  const swipeDisabled = status === 'not_applicable'

  const translateX = useSharedValue(0)
  const dragStartX = useSharedValue(0)

  const fireToggle = useCallback(() => { onToggle(step.id, ds) }, [onToggle, step.id, ds])
  const fireMarkFailed = useCallback(() => { onMarkFailed?.(step.id) }, [onMarkFailed, step.id])
  const fireHapticSuccess = useCallback(() => { void hapticSuccess() }, [])
  const fireHapticWarning = useCallback(() => { void hapticWarning() }, [])

  const panGesture = Gesture.Pan()
    .enabled(!swipeDisabled)
    .runOnJS(true)
    .minDistance(10)
    .onStart((e) => { dragStartX.value = e.x })
    .onUpdate((e) => {
      const raw = e.x - dragStartX.value
      translateX.value = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, raw))
    })
    .onEnd((e) => {
      const distance = e.x - dragStartX.value
      const velocity = e.velocityX
      const swipeRight = distance > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD
      const swipeLeft = distance < -SWIPE_THRESHOLD || velocity < -SWIPE_VELOCITY_THRESHOLD

      if (swipeRight) {
        fireToggle()
        fireHapticSuccess()
      } else if (swipeLeft && onMarkFailed) {
        fireMarkFailed()
        fireHapticWarning()
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
    })
    .onFinalize(() => {
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
    })

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const rightPanelStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? Math.min(1, translateX.value / SWIPE_THRESHOLD) : 0,
  }))

  const leftPanelStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? Math.min(1, -translateX.value / SWIPE_THRESHOLD) : 0,
  }))

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Background action panels — revealed behind the translating content */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
            backgroundColor: accentColor, alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 20,
          },
          rightPanelStyle,
        ]}
      >
        <Check size={20} color="#fff" />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%',
            backgroundColor: FAILURE_RED, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 20,
          },
          leftPanelStyle,
        ]}
      >
        <XIcon size={20} color="#fff" />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={contentAnimatedStyle}>
          <Pressable
            onPress={onSelect}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 8, paddingHorizontal: 12,
              backgroundColor: isSelected ? BLUE + '08' : '#fff',
              borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
              borderLeftWidth: isSelected ? 3 : 0,
              borderLeftColor: isSelected ? accentColor : 'transparent',
            }}
          >
            <HabitRowContent {...props} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
