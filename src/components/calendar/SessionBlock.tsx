'use client'

import { format } from 'date-fns'
import type { Session } from '@/types'

const STATUS_BG: Record<Session['status'], string> = {
  planned: 'rgba(255,255,255,0.96)',
  done: '#F0FDF4',
  cancelled: '#FEF2F2',
}

const STATUS_OPACITY: Record<Session['status'], number> = {
  planned: 1,
  done: 0.85,
  cancelled: 0.55,
}

interface Props {
  session: Session
  coachColor: string
  serviceName: string
  clientName?: string
  /** Number of parallel columns (for overlap layout) */
  totalCols?: number
  /** Column index (for overlap layout) */
  colIndex?: number
  onClick?: () => void
  compact?: boolean
}

export function SessionBlock({
  session,
  coachColor,
  serviceName,
  clientName,
  totalCols = 1,
  colIndex = 0,
  onClick,
  compact = false,
}: Props) {
  const start = session.startAt.toDate()
  const end = session.endAt.toDate()
  const clientCount = session.clientIds.length

  const widthPct = 100 / totalCols
  const leftPct = colIndex * widthPct

  return (
    <button
      onClick={onClick}
      className="absolute rounded-[6px] border text-left overflow-hidden press-effect"
      style={{
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        top: 0,
        bottom: 0,
        background: STATUS_BG[session.status],
        borderColor: coachColor,
        borderLeftWidth: 3,
        opacity: STATUS_OPACITY[session.status],
      }}
    >
      <div className="px-1.5 py-0.5 h-full flex flex-col justify-start overflow-hidden">
        <p className="text-[9px] font-semibold leading-tight truncate" style={{ color: coachColor }}>
          {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
        </p>
        {compact ? (
          clientName && (
            <p className="text-[9px] font-medium text-text-primary truncate leading-tight">{clientName}</p>
          )
        ) : (
          <>
            <p className="text-[11px] font-medium text-text-primary truncate leading-tight mt-0.5">{serviceName}</p>
            {clientCount > 0 && (
              <p className="text-[10px] text-text-secondary leading-tight">{clientCount} client{clientCount > 1 ? 's' : ''}</p>
            )}
          </>
        )}
      </div>
    </button>
  )
}
