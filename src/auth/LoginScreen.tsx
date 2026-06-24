import { View, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from './useAuth'
import { CheckSquare, LogIn } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  remoteKey: z.string().min(1, 'Remote key is required'),
})

type FormData = z.infer<typeof schema>

export function LoginScreen() {
  const { login, isLoading, error } = useAuth()

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    try {
      await login(data.email, data.remoteKey)
    } catch {
      // error handled in store
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-muted"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerClassName="flex-grow items-center justify-center p-4"
        keyboardShouldPersistTaps="handled"
      >
        <Card className="w-full max-w-md p-8"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 }}
        >
          {/* Header */}
          <View className="flex-row items-center gap-3 mb-8">
            <View className="w-10 h-10 rounded-xl bg-primary items-center justify-center">
              <CheckSquare size={20} color="white" />
            </View>
            <View>
              <Text className="text-xl font-semibold text-foreground">Checkvist</Text>
              <Text className="text-sm text-muted-foreground">Sign in to your account</Text>
            </View>
          </View>

          {error && (
            <View className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <Text className="text-destructive text-sm">{error}</Text>
            </View>
          )}

          {/* Email */}
          <View className="mb-4">
            <Text className="text-sm font-medium text-foreground mb-1">Email</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  style={{ fontSize: 16 }}
                />
              )}
            />
            {errors.email && (
              <Text className="mt-1 text-xs text-destructive">{errors.email.message}</Text>
            )}
          </View>

          {/* Remote Key */}
          <View className="mb-6">
            <Text className="text-sm font-medium text-foreground mb-1">Remote Key</Text>
            <Controller
              control={control}
              name="remoteKey"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  placeholder="Your Checkvist remote key"
                  secureTextEntry
                  textContentType="password"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  style={{ fontSize: 16 }}
                />
              )}
            />
            {errors.remoteKey && (
              <Text className="mt-1 text-xs text-destructive">{errors.remoteKey.message}</Text>
            )}
            <Text className="mt-1 text-xs text-muted-foreground">
              Find your remote key at checkvist.com → Settings → Remote access
            </Text>
          </View>

          {/* Submit */}
          <Button onPress={handleSubmit(onSubmit)} disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <LogIn size={16} color="white" />
            )}
            <Text>{isLoading ? 'Signing in…' : 'Sign in'}</Text>
          </Button>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
