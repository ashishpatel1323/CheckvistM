import * as React from 'react'
import { View } from 'react-native'
import { cn } from '@/lib/utils'
import { Text, TextClassContext } from './text'

export const Card = React.forwardRef<View, React.ComponentProps<typeof View>>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn('rounded-lg border border-border bg-card', className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'

export const CardHeader = React.forwardRef<View, React.ComponentProps<typeof View>>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn('gap-1.5 p-4', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentProps<typeof Text>
>(({ className, ...props }, ref) => (
  <Text
    ref={ref}
    role="heading"
    className={cn('text-lg font-semibold text-card-foreground', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentProps<typeof Text>
>(({ className, ...props }, ref) => (
  <Text
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = React.forwardRef<View, React.ComponentProps<typeof View>>(
  ({ className, ...props }, ref) => (
    <TextClassContext.Provider value="text-card-foreground">
      <View ref={ref} className={cn('p-4 pt-0', className)} {...props} />
    </TextClassContext.Provider>
  )
)
CardContent.displayName = 'CardContent'

export const CardFooter = React.forwardRef<View, React.ComponentProps<typeof View>>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn('flex-row items-center p-4 pt-0', className)}
      {...props}
    />
  )
)
CardFooter.displayName = 'CardFooter'
