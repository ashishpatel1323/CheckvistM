import { View, Text, Pressable, Platform } from 'react-native'
import { Linking } from 'react-native'
import { Globe } from 'lucide-react-native'

interface RawViewProps {
  checklistId: number
}

const BLUE = '#4772FA'

export function RawView({ checklistId }: RawViewProps) {
  const url = `https://checkvist.com/checklists/${checklistId}`

  if (Platform.OS === 'web') {
    return (
      <iframe
        src={url}
        className="flex-1 w-full h-full border-none"
        title="Checkvist Raw View"
      />
    )
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
      <View style={{
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
      }}>
        <Globe size={36} color={BLUE} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: '#222', textAlign: 'center' }}>
        View in Browser
      </Text>
      <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 }}>
        Opens the full Checkvist web app in your browser with all features.
      </Text>
      <Pressable
        onPress={() => Linking.openURL(url)}
        style={{
          backgroundColor: BLUE, borderRadius: 28, paddingVertical: 14,
          paddingHorizontal: 32, marginTop: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>Open Checkvist</Text>
      </Pressable>
      <Text style={{ fontSize: 12, color: '#BDBDBD', textAlign: 'center' }}>{url}</Text>
    </View>
  )
}
