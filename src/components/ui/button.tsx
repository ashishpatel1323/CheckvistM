import * as React from 'react'
import { Pressable } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { TextClassContext } from './text'

const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-md active:opacity-90 disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        secondary: 'bg-secondary',
        destructive: 'bg-destructive',
        outline: 'border border-border bg-background active:bg-muted',
        ghost: 'active:bg-muted',
        link: '',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3',
        lg: 'h-12 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

const buttonTextVariants = cva('text-sm font-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      secondary: 'text-secondary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
    size: { default: '', sm: '', lg: 'text-base', icon: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export type ButtonProps = React.ComponentProps<typeof Pressable> &
  VariantProps<typeof buttonVariants>

export const Button = React.forwardRef<
  React.ElementRef<typeof Pressable>,
  ButtonProps
>(({ className, variant, size, ...props }, ref) => {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        ref={ref}
        role="button"
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    </TextClassContext.Provider>
  )
})
Button.displayName = 'Button'

export { buttonVariants, buttonTextVariants }
