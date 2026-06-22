import { useCallback, useState } from 'react'
import { View, Pressable, Platform } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Check, X as XIcon, RotateCcw } from 'lucide-react-native'
import { format } from 'date-fns'
import { ROUTINE_COLORS } from './routineTypes'
import { getStepStatus } from './routineSchedule'
import { hapticSuccess, hapticWarning, hapticLight } from '@/lib/haptics'
import { BLUE, FAILURE_RED } from './RoutinesView'
import type { HabitRowProps } from './RoutinesView'
import { HabitRowContent } from './HabitRowContent'

const SWIPE_THRESHOLD = 50
const SWIPE_VELOCITY_THRESHOLD = 200
const MAX_DRAG = 96
const LEFT_OPEN_X = -140

/**
 * TickTick-style swipeable habit row, used only for the mobile single-date
 * "Day view" list (works in mobile form factor on both web and native —
 * react-native-gesture-handler / reanimated both support react-native-web).
 * Swipe right marks the step done (commits immediately). Swipe left snaps
 * the row open to reveal Reset / Fail buttons the user taps to confirm.
 * Tapping the habit icon (not the row) opens the habit detail view.
 * The pan gesture is axis-locked to horizontal so vertical scrolling on the
 * surrounding list is never hijacked.
 */
export function SwipeableHabitRow(props: HabitRowProps) {
  const { step, routine, visibleDates, onToggle, onMarkFailed, onReset, checkinsByDate, failedByDate, onSelect, isSelected } = props

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
  const [leftOpen, setLeftOpen] = useState(false)

  const fireToggle = useCallback(() => { onToggle(step.id, ds) }, [onToggle, step.id, ds])
  const fireMarkFailed = useCallback(() => { onMarkFailed?.(step.id) }, [onMarkFailed, step.id])
  const fireReset = useCallback(() => { onReset?.(step.id) }, [onReset, step.id])
  const fireHapticSuccess = useCallback(() => { void hapticSuccess() }, [])
  const fireHapticWarning = useCallback(() => { void hapticWarning() }, [])
  const fireHapticLight = useCallback(() => { void hapticLight() }, [])

  const closeLeftPanel = useCallback(() => {
    setLeftOpen(false)
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
  }, [translateX])

  const panGesture = Gesture.Pan()
    .enabled(!swipeDisabled)
    .runOnJS(true)
    .minDistance(10)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onStart((e) => { dragStartX.value = e.x - (leftOpen ? LEFT_OPEN_X : 0) })
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
        setLeftOpen(false)
        fireToggle()
        fireHapticSuccess()
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
      } else if (swipeLeft && (onMarkFailed || onReset)) {
        setLeftOpen(true)
        fireHapticLight()
        translateX.value = withSpring(LEFT_OPEN_X, { damping: 18, stiffness: 220 })
      } else {
        setLeftOpen(false)
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
      }
    })
    .onFinalize(() => {
      // no-op: settling is handled per-branch in onEnd so the open panel can stay revealed
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
      {/* Right-reveal: done confirmation (swipe right) */}
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

      {/* Left-reveal: Reset / Fail action buttons */}
      <Animated.View
        pointerEvents={leftOpen ? 'box-none' : 'none'}
        style={[
          {
            position: 'absolute', right: 0, top: 0, bottom: 0,
            flexDirection: 'row', alignItems: 'stretch',
          },
          leftPanelStyle,
        ]}
      >
        <Pressable
          onPress={() => { fireReset(); fireHapticLight(); closeLeftPanel() }}
          style={{ width: 70, backgroundColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', gap: 2 }}
        >
          <RotateCcw size={18} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => { fireMarkFailed(); fireHapticWarning(); closeLeftPanel() }}
          style={{ width: 70, backgroundColor: FAILURE_RED, alignItems: 'center', justifyContent: 'center', gap: 2 }}
        >
          <XIcon size={18} color="#fff" />
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[contentAnimatedStyle, Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as object) : null]}
        >
          <Pressable
            onPress={leftOpen ? closeLeftPanel : undefined}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingVertical: 8, paddingHorizontal: 12,
              backgroundColor: isSelected ? BLUE + '08' : '#fff',
              borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
              borderLeftWidth: isSelected ? 3 : 0,
              borderLeftColor: isSelected ? accentColor : 'transparent',
            }}
          >
            <HabitRowContent {...props} onIconPress={onSelect} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
