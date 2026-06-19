import * as React from 'react'
import { Label } from './label'
import { cn } from '@/lib/utils/cn'

interface FormFieldProps {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}

export function FormField({ label, htmlFor, error, hint, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-[12px] text-[var(--color-text-tertiary)]">{hint}</p>
      )}
      {error && (
        <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
      )}
    </div>
  )
}
