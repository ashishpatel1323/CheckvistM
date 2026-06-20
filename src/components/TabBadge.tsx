import { View, Text, Platform, type StyleProp, type ViewStyle } from 'react-native'

export function TabBadge({
  count,
  color = '#EF4444',
  compact = false,
  style,
}: {
  count: number
  color?: string
  /** Smaller badge for tight horizontal layouts (e.g. desktop header tabs). */
  compact?: boolean
  /** Override positioning (e.g. anchor to a tab corner instead of the icon). */
  style?: StyleProp<ViewStyle>
}) {
  if (count === 0) return null

  const displayCount = count > 99 ? '99+' : String(count)
  const isWeb = Platform.OS === 'web'
  const size = compact ? 15 : 20
  const fontSize = compact ? 9 : 10

  return (
    <View
      style={[
        {
          position: 'absolute',
          top: isWeb ? -6 : -10,
          right: isWeb ? -8 : -12,
          backgroundColor: color,
          borderRadius: size / 2,
          minWidth: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: compact ? 3 : 4,
          borderWidth: compact ? 1.5 : 2,
          borderColor: 'white',
          zIndex: 10,
        },
        style,
      ]}
    >
      <Text style={{ fontSize, fontWeight: '700', color: 'white' }}>
        {displayCount}
      </Text>
    </View>
  )
}
