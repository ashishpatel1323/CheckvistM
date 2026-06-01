import React from 'react'
import { Text, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useDragContext } from './DragContext'

export function DragGhost() {
  const { ghostScreenY, ghostOpacity, draggingContent, containerScreenY } = useDragContext()

  const style = useAnimatedStyle(() => ({
    top: ghostScreenY.value - containerScreenY.current - 18,
    opacity: withSpring(ghostOpacity.value, { damping: 20, stiffness: 300 }),
  }))

  return (
    <Animated.View pointerEvents="none" style={[styles.ghost, style]}>
      <Text numberOfLines={1} style={styles.text}>{draggingContent}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    left: 8,
    right: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E8632A',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    zIndex: 999,
  },
  text: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
})
