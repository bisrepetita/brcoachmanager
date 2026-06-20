'use client'

import { useMemo, useEffect, useState, useRef } from 'react'
import { isSameDay } from 'date-fns'
import { SessionBlock } from './SessionBlock'
import type { Session, User, Service } from '@/types'

const START_HOUR = 6
const TOTAL_HOURS = 16 // 06:00 → 22:00
const HOUR_PX = 64
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_PX
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i)

function toTopPx(date: Date): number {
  return (date.getHours() * 60 + date.getMinutes() - START_HOUR * 60) * (HOUR_PX / 60)
}

function toDurationPx(start: Date, end: Date): number {
  const mins = (end.getTime() - start.getTime()) / 60000
  return Math.max(32, mins * (HOUR_PX / 60))
}

interface LayoutSession {
  session: Session
  top: number
  height: number
  col: number
  numCols: number
}

function layoutSessions(sessions: Session[]): LayoutSession[] {
  const sorted = [...sessions].sort((a, b) => a.startAt.seconds - b.startAt.seconds)
  const cols: number[] = [] // end time (seconds) per column

  const placed = sorted.map((session) => {
    const startSec = session.startAt.seconds
    const endSec = session.endAt.seconds
    let col = cols.findIndex((endTime) => endTime <= startSec)
    if (col === -1) { col = cols.length; cols.push(endSec) }
    else cols[col] = endSec

    const start = session.startAt.toDate()
    const end = session.endAt.toDate()
    return { session, top: toTopPx(start), height: toDurationPx(start, end), col, numCols: 0 }
  })

  const total = cols.length || 1
  placed.forEach((p) => (p.numCols = total))
  return placed
}

interface ExternalEvent { uid: string; title: string; start: string; end: string }

interface Props {
  date: Date
  sessions: Session[]
  coachMap: Map<string, User>
  serviceMap: Map<string, Service>
  externalEvents?: ExternalEvent[]
  onSessionClick: (session: Session) => void
  onSlotClick: (hour: number) => void
}

export function DayView({ date, sessions, coachMap, serviceMap, externalEvents = [], onSessionClick, onSlotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowPx, setNowPx] = useState<number | null>(null)

  const daySessions = useMemo(
    () => sessions.filter((s) => isSameDay(s.startAt.toDate(), date)),
    [sessions, date]
  )

  const laid = useMemo(() => layoutSessions(daySessions), [daySessions])

  // Current time indicator
  useEffect(() => {
    function update() {
      const now = new Date()
      if (isSameDay(now, date)) {
        const px = toTopPx(now)
        setNowPx(px >= 0 && px <= TOTAL_HEIGHT ? px : null)
      } else {
        setNowPx(null)
      }
    }
    update()
    const timer = setInterval(update, 30000)
    return () => clearInterval(timer)
  }, [date])

  // Scroll to current time (or 8h) on mount
  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const targetPx = isSameDay(now, date)
      ? Math.max(0, toTopPx(now) - 80)
      : (8 - START_HOUR) * HOUR_PX
    scrollRef.current.scrollTop = targetPx
  }, [date])

  return (
    <div ref={scrollRef} className="overflow-y-auto flex-1">
      <div className="flex" style={{ height: TOTAL_HEIGHT }}>
        {/* Time labels */}
        <div className="shrink-0 w-12 relative select-none" style={{ height: TOTAL_HEIGHT }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 text-[10px] leading-none"
              style={{ top: (h - START_HOUR) * HOUR_PX - 6, color: '#A09890' }}
            >
              {String(h).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 relative border-l border-[var(--color-border)]" style={{ height: TOTAL_HEIGHT }}>
          {/* Hour lines */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute inset-x-0 border-t"
              style={{ top: (h - START_HOUR) * HOUR_PX, borderColor: '#E5E1DA' }}
            />
          ))}

          {/* Half-hour lines (dashed) */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <div
              key={`half-${i}`}
              className="absolute inset-x-0 border-t border-dashed"
              style={{ top: (i + 0.5) * HOUR_PX, borderColor: '#F0EDE8' }}
            />
          ))}

          {/* Tap slots (create session) */}
          {Array.from({ length: TOTAL_HOURS }, (_, i) => (
            <button
              key={`slot-${i}`}
              className="absolute inset-x-0 hover:bg-[#F0EDE8]/50 transition-colors"
              style={{ top: i * HOUR_PX, height: HOUR_PX }}
              onClick={() => onSlotClick(START_HOUR + i)}
            />
          ))}

          {/* Current time */}
          {nowPx !== null && (
            <div className="absolute inset-x-0 z-20 flex items-center pointer-events-none" style={{ top: nowPx }}>
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 shrink-0" />
              <div className="flex-1 h-px bg-red-500" />
            </div>
          )}

          {/* Événements Google Calendar */}
          {externalEvents.filter(e => isSameDay(new Date(e.start), date)).map(e => {
            const s = new Date(e.start), en = new Date(e.end)
            const top = toTopPx(s), height = Math.max(24, toDurationPx(s, en))
            return (
              <div key={e.uid} className="absolute z-5 pointer-events-none" style={{ top, height, right: 2, left: 2 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 6, background: 'rgba(66,133,244,0.10)', borderLeft: '3px solid #4285F4', padding: '2px 6px', overflow: 'hidden' }}>
                  <p style={{ fontSize: 11, color: '#4285F4', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{e.title}</p>
                </div>
              </div>
            )
          })}

          {/* Sessions */}
          {laid.map(({ session, top, height, col, numCols }) => {
            const coachColor = session.coachIds[0] ? (coachMap.get(session.coachIds[0])?.color ?? '#6366F1') : '#6366F1'
            const serviceName = serviceMap.get(session.serviceId)?.name ?? ''
            return (
              <div key={session.id} className="absolute inset-x-1 z-10" style={{ top, height }}>
                <SessionBlock
                  session={session}
                  coachColor={coachColor}
                  serviceName={serviceName}
                  totalCols={numCols}
                  colIndex={col}
                  compact={height < 44}
                  onClick={() => onSessionClick(session)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
