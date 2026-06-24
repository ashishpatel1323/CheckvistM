import * as React from 'react'
import { TextInput } from 'react-native'
import { cn } from '@/lib/utils'

export type InputProps = React.ComponentProps<typeof TextInput>

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, placeholderClassName, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          'h-11 rounded-md border border-input bg-background px-3 text-base text-foreground',
          'web:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring',
          props.editable === false && 'opacity-50',
          className
        )}
        placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
        placeholderTextColor="hsl(220 9% 63%)"
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
