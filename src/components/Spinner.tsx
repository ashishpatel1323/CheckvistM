import { ActivityIndicator, View } from 'react-native'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = { sm: 'small', md: 'small', lg: 'large' } as const

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <View className={`flex-1 items-center justify-center ${className ?? ''}`}>
      <ActivityIndicator size={sizeMap[size]} color="#E8632A" />
    </View>
  )
}
