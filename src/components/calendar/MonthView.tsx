'use client'

import { useMemo } from 'react'
import {
  startOfMonth, endOfMonth,
  startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday,
  format,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Session, User, Service } from '@/types'

const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const MAX_VISIBLE = 3

interface Props {
  anchor: Date
  sessions: Session[]
  coachMap: Map<string, User>
  serviceMap: Map<string, Service>
  onSessionClick: (session: Session) => void
  onDayClick: (date: Date) => void
}

export function MonthView({ anchor, sessions, coachMap, serviceMap, onSessionClick, onDayClick }: Props) {
  const gridDays = useMemo(() => {
    const mStart = startOfMonth(anchor)
    const mEnd = endOfMonth(anchor)
    return eachDayOfInterval({
      start: startOfWeek(mStart, { weekStartsOn: 1 }),
      end: endOfWeek(mEnd, { weekStartsOn: 1 }),
    })
  }, [anchor])

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const session of sessions) {
      const key = format(session.startAt.toDate(), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(session)
      map.set(key, arr)
    }
    return map
  }, [sessions])

  const currentMonth = anchor.getMonth()

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[var(--color-border)] sticky top-0 bg-[var(--color-background)] z-10">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center py-2 text-[11px] font-semibold" style={{ color: '#A09890' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {gridDays.map((day, i) => {
          const key = format(day, 'yyyy-MM-dd')
          const daySessions = sessionsByDay.get(key) ?? []
          const inMonth = day.getMonth() === currentMonth
          const today = isToday(day)
          const visible = daySessions.slice(0, MAX_VISIBLE)
          const overflow = daySessions.length - MAX_VISIBLE

          return (
            <div
              key={i}
              className="min-h-[80px] border-b border-r border-[var(--color-border)] p-1 cursor-pointer"
              style={{ borderColor: '#E5E1DA', opacity: inMonth ? 1 : 0.35 }}
              onClick={() => onDayClick(day)}
            >
              {/* Day number */}
              <div className="flex items-center justify-center mb-1">
                <span
                  className="text-[12px] font-medium w-6 h-6 flex items-center justify-center rounded-full leading-none"
                  style={{
                    background: today ? '#1A1A18' : 'transparent',
                    color: today ? '#FFFFFF' : inMonth ? '#1A1A18' : '#A09890',
                    fontWeight: today ? 700 : 500,
                  }}
                >
                  {format(day, 'd')}
                </span>
              </div>

              {/* Session pills */}
              <div className="space-y-0.5">
                {visible.map((session) => {
                  const coachColor = session.coachIds[0]
                    ? (coachMap.get(session.coachIds[0])?.color ?? '#6366F1')
                    : '#6366F1'
                  const opacity = session.status === 'cancelled' ? 0.4 : session.status === 'done' ? 0.7 : 1

                  return (
                    <button
                      key={session.id}
                      className="w-full text-left flex items-center gap-1 rounded-[3px] px-1 py-0.5"
                      style={{ background: `${coachColor}20`, opacity }}
                      onClick={(e) => { e.stopPropagation(); onSessionClick(session) }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: coachColor }} />
                      <span className="text-[9px] truncate font-medium" style={{ color: '#1A1A18' }}>
                        {format(session.startAt.toDate(), 'HH:mm')}
                        {' '}{serviceMap.get(session.serviceId)?.name ?? ''}
                      </span>
                    </button>
                  )
                })}
                {overflow > 0 && (
                  <p className="text-[9px] text-[#7A7570] pl-1">+{overflow} autre{overflow > 1 ? 's' : ''}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
