import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SelectNativeProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
}

const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'w-full h-12 pl-4 pr-10 text-[14px] outline-none transition-colors appearance-none',
          'bg-[var(--color-surface)] text-[var(--color-text-primary)]',
          'border border-[var(--color-border)] rounded-[var(--radius-input)]',
          'focus:border-[var(--color-border-strong)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-[var(--color-danger)]',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: 'var(--color-text-tertiary)' }}
      />
    </div>
  )
)
SelectNative.displayName = 'SelectNative'

export { SelectNative }
