import { View } from 'react-native'

export function TaskSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View className="p-4 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 py-2">
          <View className="w-4 h-4 rounded-full bg-gray-200" />
          <View className="flex-1 gap-1.5">
            <View className="h-3.5 bg-gray-200 rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
            {i % 2 === 0 && <View className="h-3 bg-gray-100 rounded w-1/3" />}
          </View>
          {i % 3 === 0 && <View className="w-12 h-4 bg-gray-100 rounded-full" />}
        </View>
      ))}
    </View>
  )
}
