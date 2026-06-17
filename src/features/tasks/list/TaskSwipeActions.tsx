import { View, Pressable, StyleSheet } from 'react-native'
import { Calendar, Clock, Move } from 'lucide-react-native'

const ORANGE = '#F28C28'
const ACTION_WIDTH = 80

interface TaskSwipeActionsProps {
  onSchedule: () => void
  onSnooze: () => void
  onMove: () => void
}

export function TaskSwipeActions({
  onSchedule,
  onSnooze,
  onMove,
}: TaskSwipeActionsProps) {
  return (
    <View style={styles.container}>
      {/* Schedule action */}
      <Pressable
        onPress={onSchedule}
        style={styles.action}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      >
        <Calendar size={24} color="#fff" />
      </Pressable>

      {/* Snooze action */}
      <Pressable
        onPress={onSnooze}
        style={styles.action}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      >
        <Clock size={24} color="#fff" />
      </Pressable>

      {/* Move action */}
      <Pressable
        onPress={onMove}
        style={styles.action}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      >
        <Move size={24} color="#fff" />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: ACTION_WIDTH * 3,
    backgroundColor: ORANGE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  action: {
    width: ACTION_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
})

export { ACTION_WIDTH }
