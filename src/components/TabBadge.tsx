import { View, Text } from 'react-native'

export function TabBadge({ count, color = '#EF4444' }: { count: number; color?: string }) {
  if (count === 0) return null

  const displayCount = count > 99 ? '99+' : String(count)

  return (
    <View
      style={{
        position: 'absolute',
        top: -2,
        right: -6,
        backgroundColor: color,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: 'white',
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: 'white' }}>
        {displayCount}
      </Text>
    </View>
  )
}
