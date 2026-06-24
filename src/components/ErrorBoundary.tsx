import React from 'react'
import { View, Text, ScrollView } from 'react-native'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView className="flex-1 p-4 bg-destructive/10">
          <Text className="font-bold text-destructive text-base mb-2">Render Error</Text>
          <Text className="text-destructive text-sm font-mono">{this.state.error.message}</Text>
          <Text className="text-destructive text-xs mt-2 font-mono">{this.state.error.stack}</Text>
        </ScrollView>
      )
    }
    return this.props.children
  }
}
