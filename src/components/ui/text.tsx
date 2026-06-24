import * as React from 'react'
import { Text as RNText } from 'react-native'
import { cn } from '@/lib/utils'

/** Lets container primitives (Button, Card) set the default text color/size for
 *  any <Text> rendered inside them, mirroring shadcn's text inheritance. */
export const TextClassContext = React.createContext<string | undefined>(undefined)

export type TextProps = React.ComponentProps<typeof RNText>

export const Text = React.forwardRef<RNText, TextProps>(
  ({ className, ...props }, ref) => {
    const ctxClass = React.useContext(TextClassContext)
    return (
      <RNText
        ref={ref}
        className={cn('text-base text-foreground', ctxClass, className)}
        {...props}
      />
    )
  }
)
Text.displayName = 'Text'
