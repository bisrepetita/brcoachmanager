'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { extendInfiniteRecurrences } from '@/lib/services/recurrence.service'
import { sendNotification } from '@/lib/services/notification.service'
import { useRouter } from 'next/navigation'
import {
  format, startOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, addDays, addWeeks, addMonths,
  subDays, subWeeks, subMonths,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { orderBy, where, getDocs, query, collection, doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useAuth } from '@/lib/hooks/useAuth'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { DayView } from '@/components/calendar/DayView'
import { WeekView } from '@/components/calendar/WeekView'
import { MonthView } from '@/components/calendar/MonthView'
import { useSessions } from '@/lib/hooks/useSessions'
import { useCollection } from '@/lib/hooks/useCollection'
import type { User, Service, Session, Client } from '@/types'

type CalView = 'day' | 'week' | 'month'

// Height of the view-switcher bar (px) — must match the div below
const SWITCHER_H = 44

function getRange(view: CalView, anchor: Date): { start: Date; end: Date } {
  switch (view) {
    case 'day':
      return { start: startOfDay(anchor), end: new Date(startOfDay(anchor).getTime() + 86399999) }
    case 'week':
      return {
        start: startOfWeek(anchor, { weekStartsOn: 1 }),
        end: endOfWeek(anchor, { weekStartsOn: 1 }),
      }
    case 'month': {
      const ms = startOfMonth(anchor)
      const me = endOfMonth(anchor)
      return {
        start: startOfWeek(ms, { weekStartsOn: 1 }),
        end: endOfWeek(me, { weekStartsOn: 1 }),
      }
    }
  }
}

function getTitle(view: CalView, anchor: Date): string {
  switch (view) {
    case 'day':
      return format(anchor, 'EEEE d MMMM', { locale: fr })
    case 'week': {
      const ws = startOfWeek(anchor, { weekStartsOn: 1 })
      const we = endOfWeek(anchor, { weekStartsOn: 1 })
      return ws.getMonth() === we.getMonth()
        ? `${format(ws, 'd')}–${format(we, 'd MMM yyyy', { locale: fr })}`
        : `${format(ws, 'd MMM', { locale: fr })} – ${format(we, 'd MMM yyyy', { locale: fr })}`
    }
    case 'month':
      return format(anchor, 'MMMM yyyy', { locale: fr })
  }
}

function navigate(view: CalView, anchor: Date, dir: 1 | -1): Date {
  if (view === 'day') return dir === 1 ? addDays(anchor, 1) : subDays(anchor, 1)
  if (view === 'week') return dir === 1 ? addWeeks(anchor, 1) : subWeeks(anchor, 1)
  return dir === 1 ? addMonths(anchor, 1) : subMonths(anchor, 1)
}

export default function CalendarPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [view, setView] = useState<CalView>('week')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))

  const range = useMemo(() => getRange(view, anchor), [view, anchor])
  const { sessions } = useSessions(range.start, range.end)
  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])

  const coachMap = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches])
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  // Prolonge les récurrences infinies si besoin (une fois par chargement de page)
  useEffect(() => {
    extendInfiniteRecurrences().catch(() => {})
  }, [])

  // Rappels J-1 : cherche les séances de demain sans reminderSentAt
  useEffect(() => {
    if (!user?.id) return
    const tomorrow = addDays(startOfDay(new Date()), 1)
    const dayAfter = addDays(tomorrow, 1)

    getDocs(query(
      collection(db, 'sessions'),
      where('coachIds', 'array-contains', user.id),
      where('status', '==', 'planned'),
      where('startAt', '>=', Timestamp.fromDate(tomorrow)),
      where('startAt', '<', Timestamp.fromDate(dayAfter)),
    )).then(async snap => {
      for (const d of snap.docs) {
        const data = d.data()
        if (data.reminderSentAt) continue
        const startDate = data.startAt.toDate()
        await sendNotification({
          userIds: data.coachIds as string[],
          title: 'Rappel séance demain',
          body: `${data.priceSnapshot?.serviceName ?? 'Séance'} · ${format(startDate, 'HH:mm', { locale: fr })}`,
          link: `/sessions/${d.id}`,
        })
        await updateDoc(doc(db, 'sessions', d.id), { reminderSentAt: Timestamp.now() })
      }
    }).catch(() => {})
  }, [user?.id])

  const handleSessionClick = useCallback((session: Session) => {
    router.push(`/sessions/${session.id}` as never)
  }, [router])

  const handleDaySlotClick = useCallback((hour: number) => {
    const d = new Date(anchor)
    d.setHours(hour, 0, 0, 0)
    router.push(`/sessions/new?date=${d.toISOString()}` as never)
  }, [anchor, router])

  const handleWeekSlotClick = useCallback((date: Date, hour: number) => {
    const d = new Date(date)
    d.setHours(hour, 0, 0, 0)
    router.push(`/sessions/new?date=${d.toISOString()}` as never)
  }, [router])

  const handleDayClick = useCallback((day: Date) => {
    setAnchor(startOfDay(day))
    setView('day')
  }, [])

  const title = getTitle(view, anchor)

  // Calendar content height = viewport - topbar - switcher - bottomnav
  // Using CSS calc with CSS variables — always works regardless of Tailwind scanning
  const calendarContentStyle = {
    height: `calc(100dvh - var(--top-bar-height) - ${SWITCHER_H}px - var(--bottom-nav-height))`,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  }

  return (
    <>
      <TopBar
        title={
          <div className="flex items-center gap-1">
            <button
              onClick={() => setAnchor(startOfDay(navigate(view, anchor, -1)))}
              className="p-1"
            >
              <ChevronLeft size={18} style={{ color: '#7A7570' }} />
            </button>
            <button
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="text-[14px] font-semibold capitalize"
              style={{ minWidth: 150, textAlign: 'center', color: '#1A1A18' }}
            >
              {title}
            </button>
            <button
              onClick={() => setAnchor(startOfDay(navigate(view, anchor, 1)))}
              className="p-1"
            >
              <ChevronRight size={18} style={{ color: '#7A7570' }} />
            </button>
          </div>
        }
        right={
          <button
            onClick={() => router.push('/sessions/new' as never)}
            style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A1A18', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Plus size={18} />
          </button>
        }
        noBorder
      />
      <TopBarSpacer />

      {/* View switcher */}
      <div
        className="sticky z-30 flex px-3 gap-1 border-b border-[var(--color-border)]"
        style={{
          top: 'var(--top-bar-height)',
          height: SWITCHER_H,
          alignItems: 'center',
          background: 'var(--color-surface)',
        }}
      >
        {(['day', 'week', 'month'] as CalView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 rounded-[6px] text-[12px] font-medium transition-colors"
            style={{
              height: 30,
              background: view === v ? '#1A1A18' : 'transparent',
              color: view === v ? '#FFFFFF' : '#7A7570',
            }}
          >
            {v === 'day' ? 'Jour' : v === 'week' ? 'Semaine' : 'Mois'}
          </button>
        ))}
      </div>

      {/* Calendar content — height calculated via CSS variables (not Tailwind arbitrary values) */}
      <div style={calendarContentStyle}>
        {view === 'day' ? (
          <DayView
            date={anchor}
            sessions={sessions}
            coachMap={coachMap}
            serviceMap={serviceMap}
            onSessionClick={handleSessionClick}
            onSlotClick={handleDaySlotClick}
          />
        ) : view === 'week' ? (
          <WeekView
            anchor={anchor}
            sessions={sessions}
            coachMap={coachMap}
            serviceMap={serviceMap}
            clientMap={clientMap}
            onSessionClick={handleSessionClick}
            onDayClick={handleDayClick}
            onSlotClick={handleWeekSlotClick}
          />
        ) : (
          <MonthView
            anchor={anchor}
            sessions={sessions}
            coachMap={coachMap}
            serviceMap={serviceMap}
            onSessionClick={handleSessionClick}
            onDayClick={handleDayClick}
          />
        )}
      </div>
    </>
  )
}
