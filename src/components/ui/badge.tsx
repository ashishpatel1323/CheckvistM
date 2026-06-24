import * as React from 'react'
import { View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { TextClassContext } from './text'

const badgeVariants = cva(
  'flex-row items-center rounded-full border px-2.5 py-0.5',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary',
        secondary: 'border-transparent bg-secondary',
        destructive: 'border-transparent bg-destructive',
        outline: 'border-border',
        muted: 'border-transparent bg-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

const badgeTextVariants = cva('text-xs font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      muted: 'text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
})

export type BadgeProps = React.ComponentProps<typeof View> &
  VariantProps<typeof badgeVariants>

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <TextClassContext.Provider value={badgeTextVariants({ variant })}>
      <View className={cn(badgeVariants({ variant }), className)} {...props} />
    </TextClassContext.Provider>
  )
}

export { badgeVariants, badgeTextVariants }
