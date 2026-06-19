import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full px-4 py-3 text-[14px] outline-none transition-colors resize-none',
        'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
        'border border-[var(--color-border)] rounded-[var(--radius-input)]',
        'placeholder:text-[var(--color-text-disabled)]',
        'focus:border-[var(--color-border-strong)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        error && 'border-[var(--color-danger)]',
        className
      )}
      rows={3}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export { Textarea }
