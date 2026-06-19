import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 px-8 text-center', className)}>
      <div
        className="w-16 h-16 flex items-center justify-center"
        style={{
          background: '#F0EDE8',
          border: '1px solid #E5E1DA',
          borderRadius: '10px',
        }}
      >
        <Icon className="w-7 h-7" style={{ color: '#7A7570' }} />
      </div>
      <div>
        <h3 className="text-[16px] font-semibold mb-1" style={{ color: '#1A1A18' }}>{title}</h3>
        {description && (
          <p className="text-[13px] max-w-xs" style={{ color: '#7A7570' }}>{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
