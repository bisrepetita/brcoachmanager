'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] select-none',
  {
    variants: {
      variant: {
        default:   'hover:opacity-80',
        secondary: 'hover:opacity-80',
        ghost:     'hover:opacity-80',
        destructive: 'hover:opacity-90',
        outline:   'hover:opacity-80',
        gold:      'hover:opacity-90',
      },
      size: {
        sm:       'h-8 px-3 text-xs',
        md:       'h-10 px-4 text-sm',
        lg:       'h-12 px-6 text-[15px]',
        xl:       'h-14 px-8 text-[15px]',
        icon:     'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  }
)

// Inline styles garantis sans Tailwind scanning
const variantStyles: Record<string, React.CSSProperties> = {
  default:     { backgroundColor: 'var(--color-accent)',          color: '#ffffff',                      borderRadius: 'var(--radius-button)' },
  secondary:   { backgroundColor: 'var(--color-surface-elevated)', color: 'var(--color-text-primary)',   borderRadius: 'var(--radius-button)' },
  ghost:       { backgroundColor: 'transparent',                  color: 'var(--color-text-secondary)',  borderRadius: 'var(--radius-button)' },
  destructive: { backgroundColor: 'var(--color-danger)',          color: '#ffffff',                      borderRadius: 'var(--radius-button)' },
  outline:     { backgroundColor: 'transparent',                  color: 'var(--color-text-primary)',    borderRadius: 'var(--radius-button)', border: '1px solid var(--color-border)' },
  gold:        { backgroundColor: 'var(--color-gold)',            color: '#ffffff',                      borderRadius: 'var(--radius-button)' },
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const resolvedVariant = variant ?? 'default'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ ...variantStyles[resolvedVariant], ...style }}
        ref={ref}
        disabled={disabled ?? loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
