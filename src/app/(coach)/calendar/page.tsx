'use client'

import { useState, useMemo, useCallback, useEffect, useRef, useReducer } from 'react'
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
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { DayView } from '@/components/calendar/DayView'
import { WeekView } from '@/components/calendar/WeekView'
import { MonthView } from '@/components/calendar/MonthView'
import { useSessions } from '@/lib/hooks/useSessions'
import { useCollection } from '@/lib/hooks/useCollection'
import type { User, Service, Session, Client, ClientGroup } from '@/types'

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
  const [view, setView] = useState<CalView>(() => {
    if (typeof window === 'undefined') return 'week'
    return (sessionStorage.getItem('calView') as CalView) ?? 'week'
  })
  const [anchor, setAnchor] = useState(() => {
    if (typeof window === 'undefined') return startOfDay(new Date())
    const saved = sessionStorage.getItem('calAnchor')
    return saved ? startOfDay(new Date(saved)) : startOfDay(new Date())
  })

  useEffect(() => {
    sessionStorage.setItem('calAnchor', anchor.toISOString())
    sessionStorage.setItem('calView', view)
  }, [anchor, view])

  const range = useMemo(() => getRange(view, anchor), [view, anchor])
  const { sessions } = useSessions(range.start, range.end)
  const { data: coaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: services } = useCollection<Service>('services', [orderBy('name')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  const coachMap = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches])
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups])

  // Événements Google Calendar
  const [externalEvents, setExternalEvents] = useState<{ uid: string; title: string; start: string; end: string }[]>([])
  const [gcalLoading, setGcalLoading] = useState(false)
  const [showGcal, setShowGcal] = useState(true)
  const [, forceGcalRefresh] = useReducer(x => x + 1, 0)

  useEffect(() => {
    if (!user?.googleCalendarUrl || !user?.id) return
    setGcalLoading(true)
    import('firebase/auth').then(({ getAuth }) => {
      const auth = getAuth()
      auth.currentUser?.getIdToken().then(token =>
        fetch('/api/ical-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: user.googleCalendarUrl }),
        }).then(r => r.json()).then(data => {
          if (data.events) setExternalEvents(data.events)
        })
      )
    }).finally(() => setGcalLoading(false))
  }, [user?.googleCalendarUrl, user?.id, forceGcalRefresh])

  const visibleExternalEvents = useMemo(() => {
    if (!showGcal) return []
    return externalEvents.filter(e => {
      const s = new Date(e.start)
      const en = new Date(e.end)
      return s < range.end && en > range.start
    })
  }, [externalEvents, range, showGcal])

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

  const [slideDir, setSlideDir] = useState<'left' | 'right'>('left')
  const [slideKey, setSlideKey] = useState(0)

  const navigateTo = useCallback((dir: 1 | -1) => {
    setSlideDir(dir === 1 ? 'left' : 'right')
    setSlideKey(k => k + 1)
    setAnchor(prev => startOfDay(navigate(view, prev, dir)))
  }, [view])

  const goToToday = useCallback(() => {
    const today = startOfDay(new Date())
    const currentRange = getRange(view, anchor)
    if (today >= currentRange.start && today <= currentRange.end) return
    const isFuture = today > anchor
    setSlideDir(isFuture ? 'left' : 'right')
    setSlideKey(k => k + 1)
    setAnchor(today)
  }, [view, anchor])

  const isOnToday = useMemo(() => {
    const today = startOfDay(new Date())
    const r = getRange(view, anchor)
    return today >= r.start && today <= r.end
  }, [view, anchor])

  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const endX = e.changedTouches[0]?.clientX
    if (endX === undefined) return
    const delta = endX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 50) return
    navigateTo(delta < 0 ? 1 : -1)
  }, [navigateTo])

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
            <button onClick={() => navigateTo(-1)} className="p-1">
              <ChevronLeft size={18} style={{ color: '#7A7570' }} />
            </button>
            <button
              onClick={goToToday}
              className="text-[14px] font-semibold capitalize"
              style={{ minWidth: 150, textAlign: 'center', color: '#1A1A18' }}
            >
              {title}
            </button>
            <button onClick={() => navigateTo(1)} className="p-1">
              <ChevronRight size={18} style={{ color: '#7A7570' }} />
            </button>
          </div>
        }
        left={
          !isOnToday ? (
            <button onClick={goToToday}
              style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#1A1A18', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Aujourd'hui
            </button>
          ) : undefined
        }
        right={
          <div className="flex items-center gap-2">
            {user?.googleCalendarUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setShowGcal(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: showGcal ? 'rgba(66,133,244,0.1)' : '#fff', borderColor: showGcal ? '#4285F4' : '#E5E1DA', color: showGcal ? '#4285F4' : '#A09890' }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: showGcal ? '#4285F4' : '#E5E1DA', flexShrink: 0 }} />
                  Google
                </button>
                {showGcal && (
                  <button onClick={() => forceGcalRefresh()}
                    style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E5E1DA', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw size={13} color={gcalLoading ? '#A09890' : '#7A7570'} className={gcalLoading ? 'animate-spin' : ''} />
                  </button>
                )}
              </div>
            )}
            <button
              onClick={() => router.push('/sessions/new' as never)}
              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1A1A18', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <Plus size={18} />
            </button>
          </div>
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

      <style>{`
        @keyframes slideInLeft { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes slideInRight { from { transform: translateX(-100%) } to { transform: translateX(0) } }
        .cal-slide-left { animation: slideInLeft 0.22s ease-out; }
        .cal-slide-right { animation: slideInRight 0.22s ease-out; }
      `}</style>

      {/* Calendar content — height calculated via CSS variables (not Tailwind arbitrary values) */}
      <div style={{ ...calendarContentStyle, overflow: 'hidden' }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div key={slideKey} className={slideDir === 'left' ? 'cal-slide-left' : 'cal-slide-right'} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {view === 'day' ? (
          <DayView
            date={anchor}
            sessions={sessions}
            externalEvents={visibleExternalEvents}
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
            groupMap={groupMap}
            externalEvents={visibleExternalEvents}
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
      </div>
    </>
  )
}
