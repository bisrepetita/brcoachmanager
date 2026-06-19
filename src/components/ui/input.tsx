import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-12 px-4 text-[14px] outline-none transition-colors',
        'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border)] rounded-[var(--radius-input)]',
        'placeholder:text-[var(--color-text-disabled)]',
        'focus:border-[var(--color-border-strong)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error && 'border-[var(--color-danger)] focus:border-[var(--color-danger)]',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export { Input }
