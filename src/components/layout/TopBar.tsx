'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

interface TopBarProps {
  title: React.ReactNode
  subtitle?: string
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
  noBorder?: boolean
}

export function TopBar({ title, subtitle, left, right, className, noBorder }: TopBarProps) {
  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-40 bg-surface flex items-center justify-between px-4',
        !noBorder && 'border-b border-border',
        className
      )}
      style={{ height: 'var(--top-bar-height)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {left && <div className="shrink-0">{left}</div>}
        <div className="min-w-0">
          {typeof title === 'string' ? (
            <h1 className="text-[16px] font-semibold text-text-primary truncate leading-tight">
              {title}
            </h1>
          ) : title}
          {subtitle && (
            <p className="text-[12px] text-text-tertiary leading-tight truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0 ml-3">{right}</div>}
    </header>
  )
}

export function TopBarSpacer() {
  return <div style={{ height: 'var(--top-bar-height)' }} />
}
