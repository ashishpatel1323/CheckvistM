import { View, Text, Platform } from 'react-native'

export function TabBadge({ count, color = '#EF4444' }: { count: number; color?: string }) {
  if (count === 0) return null

  const displayCount = count > 99 ? '99+' : String(count)
  const isWeb = Platform.OS === 'web'

  return (
    <View
      style={{
        position: 'absolute',
        top: isWeb ? -6 : -10,
        right: isWeb ? -8 : -12,
        backgroundColor: color,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: 'white',
        zIndex: 10,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: 'white' }}>
        {displayCount}
      </Text>
    </View>
  )
}
