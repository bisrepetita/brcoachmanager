'use client'

import * as React from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useBurgerMenu } from './BurgerMenu'

interface TopBarProps {
  title: React.ReactNode
  subtitle?: string
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
  noBorder?: boolean
}

export function TopBar({ title, subtitle, left, right, className, noBorder }: TopBarProps) {
  const burger = useBurgerMenu()

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
      <div className="shrink-0 ml-3 flex items-center gap-2">
        {right}
        {burger && (
          <button
            onClick={burger.open}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1DA', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Menu size={16} color="#7A7570" />
          </button>
        )}
      </div>
    </header>
  )
}

export function TopBarSpacer() {
  return <div style={{ height: 'var(--top-bar-height)' }} />
}
