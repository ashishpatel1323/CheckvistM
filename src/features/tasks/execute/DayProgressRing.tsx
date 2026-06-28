import { View, Text } from 'react-native'
import Svg, { Circle } from 'react-native-svg'

function DayProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  day,
  dayLabel,
  sessions,
  sessionTime,
  uniqueTasks,
  isToday,
}: {
  size: number
  strokeWidth: number
  progress: number // 0–1
  color: string
  day: number // 1–31, the date
  dayLabel: string // 'MON', 'TUE', or 'TODAY'
  sessions: number
  sessionTime: string // formatted "1h 2m"
  uniqueTasks: number
  isToday: boolean
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)))

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        {progress > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation="-90"
            originX={size / 2}
            originY={size / 2}
          />
        )}
      </Svg>

      {/* Label below ring */}
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: isToday ? '#4772FA' : '#9CA3AF', textTransform: 'uppercase' }}>
          {dayLabel}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '700', color: isToday ? '#4772FA' : '#374151' }}>
          {day}
        </Text>
        {sessions > 0 ? (
          <>
            <Text style={{ fontSize: 9, fontWeight: '600', color: isToday ? '#4772FA' : '#6B7280' }}>
              {sessions} {sessions === 1 ? 'session' : 'sessions'}
            </Text>
            <Text style={{ fontSize: 9, color: isToday ? '#6B9FFF' : '#9CA3AF' }}>
              {sessionTime}
            </Text>
            <Text style={{ fontSize: 9, color: isToday ? '#6B9FFF' : '#9CA3AF' }}>
              {uniqueTasks} {uniqueTasks === 1 ? 'task' : 'tasks'}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 9, color: '#D1D5DB' }}>—</Text>
        )}
      </View>
    </View>
  )
}

export { DayProgressRing }
