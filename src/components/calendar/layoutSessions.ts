import type { Session } from '@/types'

export interface LayoutSession {
  session: Session
  top: number
  height: number
  col: number
  numCols: number
}

const START_HOUR = 6
const HOUR_PX_DAY = 64
const HOUR_PX_WEEK = 36

function toTopPx(date: Date, hourPx: number): number {
  return (date.getHours() * 60 + date.getMinutes() - START_HOUR * 60) * (hourPx / 60)
}

function toDurationPx(start: Date, end: Date, hourPx: number): number {
  const mins = (end.getTime() - start.getTime()) / 60000
  return Math.max(hourPx === HOUR_PX_DAY ? 32 : 20, mins * (hourPx / 60))
}

export function layoutSessions(sessions: Session[], mode: 'day' | 'week' = 'day'): LayoutSession[] {
  const hourPx = mode === 'day' ? HOUR_PX_DAY : HOUR_PX_WEEK
  const sorted = [...sessions].sort((a, b) => a.startAt.seconds - b.startAt.seconds)

  const items: LayoutSession[] = sorted.map(s => ({
    session: s,
    top: toTopPx(s.startAt.toDate(), hourPx),
    height: toDurationPx(s.startAt.toDate(), s.endAt.toDate(), hourPx),
    col: 0,
    numCols: 1,
  }))

  // Greedy column assignment
  const colEnds: number[] = []
  for (const item of items) {
    const start = item.session.startAt.seconds
    const end = item.session.endAt.seconds
    const col = colEnds.findIndex(e => e <= start)
    if (col === -1) {
      item.col = colEnds.length
      colEnds.push(end)
    } else {
      item.col = col
      colEnds[col] = end
    }
  }

  // numCols per session = max col+1 among all overlapping sessions
  for (const item of items) {
    const startA = item.session.startAt.seconds
    const endA = item.session.endAt.seconds
    let maxCol = item.col
    for (const other of items) {
      const startB = other.session.startAt.seconds
      const endB = other.session.endAt.seconds
      if (startB < endA && endB > startA) {
        maxCol = Math.max(maxCol, other.col)
      }
    }
    item.numCols = maxCol + 1
  }

  return items
}
