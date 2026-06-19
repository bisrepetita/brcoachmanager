'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { format, isSameDay, isToday, startOfWeek, addDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { SessionBlock } from './SessionBlock'
import type { Session, User, Service } from '@/types'

const START_HOUR = 6
const TOTAL_HOURS = 16
const HOUR_PX = 64
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_PX
const TIME_COL = 32
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i)

function toTopPx(date: Date) {
  return (date.getHours() * 60 + date.getMinutes() - START_HOUR * 60) * (HOUR_PX / 60)
}

function toDurationPx(start: Date, end: Date) {
  return Math.max(28, ((end.getTime() - start.getTime()) / 60000) * (HOUR_PX / 60))
}

interface Props {
  anchor: Date
  sessions: Session[]
  coachMap: Map<string, User>
  serviceMap: Map<string, Service>
  onSessionClick: (session: Session) => void
  onDayClick: (date: Date) => void
  onSlotClick: (date: Date, hour: number) => void
}

export function WeekView({ anchor, sessions, coachMap, serviceMap, onSessionClick, onDayClick, onSlotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowPx, setNowPx] = useState<number | null>(null)
  const [todayCol, setTodayCol] = useState<number | null>(null)

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    function update() {
      const now = new Date()
      const col = weekDays.findIndex((d) => isSameDay(d, now))
      if (col !== -1) {
        const px = toTopPx(now)
        setNowPx(px >= 0 && px <= TOTAL_HEIGHT ? px : null)
        setTodayCol(col)
      }
    }
    update()
    const timer = setInterval(update, 30000)
    return () => clearInterval(timer)
  }, [anchor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to show current time on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const target = Math.max(0, toTopPx(now) - 80)
    scrollRef.current.scrollTop = target
  }, [anchor]) // eslint-disable-line react-hooks/exhaustive-deps

  const sessionsByDay = useMemo(() => {
    return weekDays.map((day) =>
      sessions.filter((s) => isSameDay(s.startAt.toDate(), day))
    )
  }, [sessions, anchor]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers — flex, each day takes equal width */}
      <div className="flex shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div style={{ width: TIME_COL }} className="shrink-0" />
        {weekDays.map((day, i) => {
          const today = isToday(day)
          const count = sessionsByDay[i]?.length ?? 0
          return (
            <button
              key={i}
              onClick={() => onDayClick(day)}
              className="flex flex-col items-center py-1.5 flex-1 min-w-0"
            >
              <span className="text-[9px] uppercase font-semibold" style={{ color: today ? '#1A1A18' : '#A09890' }}>
                {format(day, 'EEEEE', { locale: fr })}
              </span>
              <span
                className="text-[14px] font-semibold leading-tight mt-0.5 w-6 h-6 flex items-center justify-center rounded-full"
                style={{
                  background: today ? '#1A1A18' : 'transparent',
                  color: today ? '#FFFFFF' : '#1A1A18',
                }}
              >
                {format(day, 'd')}
              </span>
              {count > 0 && (
                <div className="w-1 h-1 rounded-full mt-0.5" style={{ background: '#A09890' }} />
              )}
            </button>
          )
        })}
      </div>

      {/* Time grid — vertical scroll only */}
      <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden flex-1">
        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* Time column */}
          <div className="shrink-0 relative select-none" style={{ width: TIME_COL, height: TOTAL_HEIGHT }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute text-[9px] leading-none"
                style={{ top: (h - START_HOUR) * HOUR_PX - 5, right: 4, color: '#A09890' }}
              >
                {String(h).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Day columns — flex-1 each */}
          {weekDays.map((day, dayIdx) => (
            <div
              key={dayIdx}
              className="relative border-l border-[var(--color-border)] flex-1 min-w-0"
              style={{ height: TOTAL_HEIGHT }}
            >
              {/* Hour lines */}
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t"
                  style={{ top: (h - START_HOUR) * HOUR_PX, borderColor: '#E5E1DA' }}
                />
              ))}

              {/* Tap slots */}
              {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                <button
                  key={i}
                  className="absolute inset-x-0"
                  style={{ top: i * HOUR_PX, height: HOUR_PX }}
                  onClick={() => onSlotClick(day, START_HOUR + i)}
                />
              ))}

              {/* Current time */}
              {nowPx !== null && todayCol === dayIdx && (
                <div className="absolute inset-x-0 z-20 flex items-center pointer-events-none" style={{ top: nowPx }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 -ml-0.5 shrink-0" />
                  <div className="flex-1 h-px bg-red-500" />
                </div>
              )}

              {/* Sessions */}
              {(sessionsByDay[dayIdx] ?? []).map((session) => {
                const start = session.startAt.toDate()
                const end = session.endAt.toDate()
                const top = toTopPx(start)
                const height = toDurationPx(start, end)
                const coachColor = session.coachIds[0] ? (coachMap.get(session.coachIds[0])?.color ?? '#6366F1') : '#6366F1'
                const serviceName = serviceMap.get(session.serviceId)?.name ?? ''
                return (
                  <div key={session.id} className="absolute z-10" style={{ top, height, left: 1, right: 1 }}>
                    <SessionBlock
                      session={session}
                      coachColor={coachColor}
                      serviceName={serviceName}
                      compact={true}
                      onClick={() => onSessionClick(session)}
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
