import { Platform } from 'react-native'
import React from 'react'

export type ListContainerProps<T> = {
  data: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  keyExtractor: (item: T, index: number) => string
  estimatedItemSize?: number
  className?: string
}

// Web: simple ScrollView-style mapped list (virtualization handled by @tanstack/react-virtual in callers)
// Native: FlashList for high-performance rendering
export function ListContainer<T>({
  data,
  renderItem,
  keyExtractor,
  className,
}: ListContainerProps<T>) {
  if (Platform.OS === 'web') {
    return (
      <div className={className ?? 'overflow-y-auto flex-1'}>
        {data.map((item, index) => (
          <React.Fragment key={keyExtractor(item, index)}>
            {renderItem(item, index)}
          </React.Fragment>
        ))}
      </div>
    )
  }

  // Native: use FlashList
  const { FlashList } = require('@shopify/flash-list')
  return (
    <FlashList
      data={data}
      renderItem={({ item, index }: { item: T; index: number }) => renderItem(item, index)}
      keyExtractor={keyExtractor}
      estimatedItemSize={56}
    />
  )
}
