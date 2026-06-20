'use client'

import { Suspense, useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, addMinutes } from 'date-fns'
import { orderBy, Timestamp, writeBatch, doc, collection, serverTimestamp, addDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { X, Check, Search, RefreshCw } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { createDoc } from '@/lib/services/crud.service'
import { sendNotification } from '@/lib/services/notification.service'
import { format as formatDate } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Service, Location, User, Client, ClientGroup, ClientPayment } from '@/types'

// ─── Styles partagés ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  height: 36, border: '1px solid #E5E1DA', borderRadius: 8,
  padding: '0 10px', fontSize: 14, color: '#1A1A18',
  background: '#F9F8F6', outline: 'none', width: '100%',
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {title}
      </p>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontSize: 14, color: '#1A1A18', flexShrink: 0, marginRight: 12 }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>{children}</div>
    </div>
  )
}

function SelectItem({ label, sub, selected, onSelect, multi = false }: {
  label: string; sub?: string; selected: boolean; onSelect: () => void; multi?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
        textAlign: 'left', width: '100%',
        backgroundColor: selected ? '#F0EDE8' : 'transparent',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: selected ? 500 : 400, margin: 0 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: '#7A7570', margin: 0 }}>{sub}</p>}
      </div>
      {selected && (
        <div style={{ width: 20, height: 20, borderRadius: multi ? 4 : 10, backgroundColor: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>
          <Check size={12} color="#fff" />
        </div>
      )}
    </button>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
        backgroundColor: value ? '#1A1A18' : '#E5E1DA',
        position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3, width: 20, height: 20,
        borderRadius: '50%', backgroundColor: '#fff', transition: 'left 200ms',
      }} />
    </button>
  )
}

// ─── Génération des occurrences ───────────────────────────────────────────────

function generateOccurrenceDates(
  startDate: Date,
  frequency: 'weekly' | 'biweekly' | 'monthly',
  end: { type: 'months'; count: number } | { type: 'count'; count: number }
): Date[] {
  const dates: Date[] = [new Date(startDate)]
  let current = new Date(startDate)

  const maxDate = end.type === 'months'
    ? new Date(startDate.getFullYear(), startDate.getMonth() + end.count, startDate.getDate())
    : null
  const maxCount = end.type === 'count' ? end.count : 500

  while (dates.length < maxCount) {
    const next = new Date(current)
    if (frequency === 'weekly') next.setDate(next.getDate() + 7)
    else if (frequency === 'biweekly') next.setDate(next.getDate() + 14)
    else next.setMonth(next.getMonth() + 1)

    if (maxDate && next > maxDate) break
    dates.push(next)
    current = next
  }

  return dates
}

const DURATIONS = [30, 45, 60, 75, 90, 120] as const
type ClientMode = 'individual' | 'group'
type RecurrenceVal = 'none' | 'weekly' | 'biweekly' | 'monthly'
type RecurrenceEndType = 'infinite' | '3months' | '6months' | '1year' | 'count'

// ─── Formulaire ──────────────────────────────────────────────────────────────

function NewSessionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const isAdmin = user?.roles?.includes('admin') ?? false

  const dateParam = searchParams.get('date')
  const initial = useMemo(() => {
    if (!dateParam) return new Date()
    const d = new Date(dateParam)
    return isNaN(d.getTime()) ? new Date() : d
  }, [dateParam])

  const [serviceId, setServiceId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [coachIds, setCoachIds] = useState<string[]>([])
  const [isIndependent, setIsIndependent] = useState(false)
  const [clientMode, setClientMode] = useState<ClientMode>('individual')
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [date, setDate] = useState(() => format(initial, 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(() => format(initial, 'HH:mm'))
  const [duration, setDuration] = useState(60)
  const [recurrence, setRecurrence] = useState<RecurrenceVal>('none')
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>('3months')
  const [recurrenceCount, setRecurrenceCount] = useState(12)
  const [clientSearch, setClientSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locationBookings, setLocationBookings] = useState<Record<string, number>>({})

  const { data: allServices } = useCollection<Service>('services', [orderBy('name')])
  const { data: allLocations } = useCollection<Location>('locations', [orderBy('name')])
  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  const services = useMemo(() => allServices.filter(s => s.active !== false), [allServices])
  const locations = useMemo(() => allLocations.filter(l => l.active !== false), [allLocations])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  useEffect(() => {
    if (user?.id) setCoachIds([user.id])
  }, [user?.id])

  // Vérifie la disponibilité des lieux pour le créneau sélectionné
  useEffect(() => {
    if (!date || !startTime) { setLocationBookings({}); return }
    const [yr, mo, dy] = date.split('-').map(Number)
    const dayStart = new Date(yr!, mo! - 1, dy!, 0, 0, 0)
    const dayEnd = new Date(yr!, mo! - 1, dy!, 23, 59, 59)
    const [hh, mm] = startTime.split(':').map(Number)
    const slotStart = new Date(yr!, mo! - 1, dy!, hh, mm, 0).getTime()
    const slotEnd = slotStart + duration * 60000

    getDocs(query(
      collection(db, 'sessions'),
      where('startAt', '>=', Timestamp.fromDate(dayStart)),
      where('startAt', '<=', Timestamp.fromDate(dayEnd)),
      where('status', '!=', 'cancelled'),
    )).then(snap => {
      const bookings: Record<string, number> = {}
      snap.docs.forEach(d => {
        const s = d.data()
        const sStart = s.startAt.toDate().getTime()
        const sEnd = s.endAt.toDate().getTime()
        if (sStart < slotEnd && sEnd > slotStart) {
          const lid = s.locationId as string
          bookings[lid] = (bookings[lid] ?? 0) + 1
        }
      })
      setLocationBookings(bookings)
    }).catch(() => {})
  }, [date, startTime, duration])

  const selectedService = useMemo(() => services.find(s => s.id === serviceId), [services, serviceId])

  const filteredClients = useMemo(() =>
    clients.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  )

  const canSubmit = !!(
    serviceId && locationId && coachIds.length > 0 && date && startTime &&
    (clientMode === 'group' ? selectedGroupId : selectedClientIds.length > 0)
  )

  // Aperçu du nombre de séances générées (null = sans fin)
  const occurrencePreview = useMemo(() => {
    if (recurrence === 'none') return null
    if (recurrenceEndType === 'infinite') return null
    const [yr, mo, dy] = date.split('-').map(Number)
    const [hh, mm] = (startTime || '08:00').split(':').map(Number)
    const startDate = new Date(yr!, mo! - 1, dy!, hh, mm, 0)
    const end = recurrenceEndType === 'count'
      ? { type: 'count' as const, count: recurrenceCount }
      : { type: 'months' as const, count: recurrenceEndType === '3months' ? 3 : recurrenceEndType === '6months' ? 6 : 12 }
    return generateOccurrenceDates(startDate, recurrence, end).length
  }, [recurrence, date, startTime, recurrenceEndType, recurrenceCount])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedService) return
    setSaving(true)
    setError('')
    try {
      const [yr, mo, dy] = date.split('-').map(Number)
      const [hh, mm] = startTime.split(':').map(Number)
      const startDate = new Date(yr!, mo! - 1, dy!, hh, mm, 0)
      const endDate = addMinutes(startDate, duration)

      let finalClientIds = selectedClientIds
      let finalGroupId: string | undefined
      if (clientMode === 'group' && selectedGroupId) {
        finalGroupId = selectedGroupId
        finalClientIds = groups.find(g => g.id === selectedGroupId)?.clientIds ?? []
      }

      const pricePerClient = selectedService.pricingMode === 'per_person'
        ? selectedService.price
        : finalClientIds.length > 0 ? Math.round((selectedService.price / finalClientIds.length) * 100) / 100 : 0

      const paymentDistribution: ClientPayment[] = finalClientIds.map(cId => ({
        clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request',
      }))

      const baseSessionData = {
        coachIds,
        clientIds: finalClientIds,
        ...(finalGroupId ? { clientGroupId: finalGroupId } : {}),
        locationId,
        serviceId,
        isIndependent,
        status: 'planned',
        paymentStatus: 'payment_to_request',
        paymentDistribution,
        priceSnapshot: {
          serviceName: selectedService.name,
          basePrice: selectedService.price,
          pricingMode: selectedService.pricingMode,
        },
        ...(isIndependent ? {
          roomRentalSnapshot: coachIds.map(cId => ({
            coachId: cId,
            amountDueToCompany: selectedService.independentRoomRentalPrice,
            status: 'pending',
          })),
        } : {}),
      }

      if (recurrence === 'none') {
        // Séance unique
        const sessionId = await createDoc('sessions', {
          ...baseSessionData,
          startAt: Timestamp.fromDate(startDate),
          endAt: Timestamp.fromDate(endDate),
        } as Record<string, unknown>)

        // Notifier les coachs assignés (sauf celui qui crée)
        const otherCoachIds = coachIds.filter(id => id !== user?.id)
        if (otherCoachIds.length > 0) {
          sendNotification({
            userIds: otherCoachIds,
            title: 'Nouvelle séance',
            body: `${selectedService.name} · ${formatDate(startDate, 'd MMM yyyy HH:mm', { locale: fr })}`,
            link: `/sessions/${sessionId}`,
          })
        }

        router.replace(`/sessions/${sessionId}` as never)
        return
      }

      // ── Séances récurrentes ─────────────────────────────────────────────────
      const isInfinite = recurrenceEndType === 'infinite'
      const endCondition: { type: 'months'; count: number } | { type: 'count'; count: number } =
        recurrenceEndType === 'count'
          ? { type: 'count', count: recurrenceCount }
          : { type: 'months', count: recurrenceEndType === '3months' ? 3 : recurrenceEndType === '6months' ? 6 : 12 }

      // Récurrence infinie : génère 3 mois d'avance initialement
      const generationEnd = isInfinite ? { type: 'months' as const, count: 3 } : endCondition
      const occurrences = generateOccurrenceDates(startDate, recurrence, generationEnd)

      // Créer la Recurrence
      const recurrenceRef = await addDoc(collection(db, 'recurrences'), {
        coachIds,
        serviceId,
        locationId,
        clientIds: finalClientIds,
        ...(finalGroupId ? { clientGroupId: finalGroupId } : {}),
        rule: {
          frequency: recurrence,
          dayOfWeek: startDate.getDay(),
          startTime,
          duration,
          startDate: Timestamp.fromDate(startDate),
          infinite: isInfinite,
          ...(!isInfinite && endCondition.type === 'months'
            ? { endDate: Timestamp.fromDate(new Date(startDate.getFullYear(), startDate.getMonth() + endCondition.count, startDate.getDate())) }
            : {}),
          ...(!isInfinite && endCondition.type === 'count'
            ? { count: endCondition.count }
            : {}),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Générer toutes les séances en batch (max 500 ops Firestore)
      const batch = writeBatch(db)
      let firstSessionId: string | null = null

      for (const occDate of occurrences) {
        const occRef = doc(collection(db, 'sessions'))
        if (!firstSessionId) firstSessionId = occRef.id
        batch.set(occRef, {
          ...baseSessionData,
          startAt: Timestamp.fromDate(occDate),
          endAt: Timestamp.fromDate(addMinutes(occDate, duration)),
          recurrenceId: recurrenceRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      router.replace(`/sessions/${firstSessionId}` as never)
    } catch (e) {
      console.error(e)
      setError('Erreur lors de la création. Réessaie.')
      setSaving(false)
    }
  }, [canSubmit, selectedService, date, startTime, duration, selectedClientIds, selectedGroupId, clientMode, groups, coachIds, locationId, serviceId, isIndependent, recurrence, recurrenceEndType, recurrenceCount, router])

  const visibleCoaches = isAdmin ? coaches : coaches.filter(c => c.id === user?.id)

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60dvh' }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
      </div>
    )
  }

  return (
    <>
      <TopBar
        title="Nouvelle séance"
        left={
          <button onClick={() => router.back()} style={{ padding: 6, color: '#7A7570', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={20} />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 140px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Date & heure */}
        <Section title="Date & heure">
          <Row label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
          </Row>
          <Row label="Début">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
          </Row>
          <Row label="Durée">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: duration === d ? '#1A1A18' : '#F0EDE8', color: duration === d ? '#fff' : '#1A1A18' }}>
                  {d} min
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* Service */}
        <Section title="Service">
          {services.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun service actif</p>}
          {services.map(s => (
            <SelectItem key={s.id} label={s.name} sub={`${s.price.toFixed(2)} CHF`} selected={serviceId === s.id} onSelect={() => setServiceId(s.id)} />
          ))}
        </Section>

        {/* Lieu */}
        <Section title="Lieu">
          {locations.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun lieu actif</p>}
          {locations.map(l => {
            const booked = locationBookings[l.id] ?? 0
            const max = l.allowMultipleBookings ? (l.maxSimultaneous ?? 1) : 1
            const full = booked >= max
            const sub = l.address
              ? full ? `${l.address} · Complet (${booked}/${max})` : l.address
              : full ? `Complet (${booked}/${max})` : undefined
            return (
              <div key={l.id} style={{ opacity: full ? 0.45 : 1 }}>
                <SelectItem label={l.name} sub={sub} selected={locationId === l.id} onSelect={() => !full && setLocationId(l.id)} />
              </div>
            )
          })}
        </Section>

        {/* Clients */}
        <Section title="Clients">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['individual', 'group'] as ClientMode[]).map(m => (
              <button key={m} onClick={() => setClientMode(m)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: clientMode === m ? '#1A1A18' : '#F0EDE8', color: clientMode === m ? '#fff' : '#1A1A18' }}>
                {m === 'individual' ? 'Individuel' : 'Groupe'}
              </button>
            ))}
          </div>
          {clientMode === 'individual' ? (
            <>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7A7570', pointerEvents: 'none' }} />
                <input type="text" placeholder="Rechercher un client..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }} />
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredClients.map(c => (
                  <SelectItem key={c.id} label={`${c.firstName} ${c.lastName}`} multi selected={selectedClientIds.includes(c.id)} onSelect={() => setSelectedClientIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} />
                ))}
                {filteredClients.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun résultat</p>}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {groups.map(g => (
                <SelectItem key={g.id} label={g.name} sub={`${g.clientIds.length} client${g.clientIds.length > 1 ? 's' : ''}`} selected={selectedGroupId === g.id} onSelect={() => setSelectedGroupId(g.id)} />
              ))}
              {groups.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun groupe</p>}
            </div>
          )}
        </Section>

        {/* Coachs */}
        <Section title={isAdmin ? 'Coach(s)' : 'Coach'}>
          {visibleCoaches.map(c => (
            <SelectItem
              key={c.id}
              label={`${c.firstName} ${c.lastName}`}
              multi={isAdmin}
              selected={coachIds.includes(c.id)}
              onSelect={() => {
                if (!isAdmin) return
                setCoachIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])
              }}
            />
          ))}
        </Section>

        {/* Mode */}
        <Section title="Mode">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
            <div>
              <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>Mode indépendant</p>
              <p style={{ fontSize: 12, color: '#7A7570', margin: '2px 0 0' }}>Location de salle facturée au coach</p>
            </div>
            <Toggle value={isIndependent} onChange={setIsIndependent} />
          </div>
        </Section>

        {/* Récurrence */}
        <Section title="Récurrence">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['none', 'Aucune'], ['weekly', 'Hebdo'], ['biweekly', 'Bi-hebdo'], ['monthly', 'Mensuel']] as [RecurrenceVal, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setRecurrence(val)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: recurrence === val ? '#1A1A18' : '#F0EDE8', color: recurrence === val ? '#fff' : '#1A1A18' }}>
                {label}
              </button>
            ))}
          </div>

          {recurrence !== 'none' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#7A7570', margin: 0 }}>Durée de la récurrence</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([['infinite', 'Sans fin'], ['3months', '3 mois'], ['6months', '6 mois'], ['1year', '1 an'], ['count', 'Nb séances']] as [RecurrenceEndType, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setRecurrenceEndType(val)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, backgroundColor: recurrenceEndType === val ? '#1A1A18' : '#F0EDE8', color: recurrenceEndType === val ? '#fff' : '#1A1A18' }}>
                    {label}
                  </button>
                ))}
              </div>

              {recurrenceEndType === 'count' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={recurrenceCount}
                    onChange={e => setRecurrenceCount(Math.max(2, Math.min(200, parseInt(e.target.value) || 2)))}
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <span style={{ fontSize: 13, color: '#7A7570' }}>séances</span>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#F0EDE8', borderRadius: 8 }}>
                <RefreshCw size={12} color="#7A7570" />
                <p style={{ fontSize: 12, color: '#7A7570', margin: 0 }}>
                  {recurrenceEndType === 'infinite'
                    ? <>3 mois générées d&apos;avance, <strong style={{ color: '#1A1A18' }}>prolongées automatiquement</strong></>
                    : <><strong style={{ color: '#1A1A18' }}>{occurrencePreview} séances</strong> seront créées</>
                  }
                </p>
              </div>
            </div>
          )}
        </Section>

        {error && <p style={{ color: '#C0392B', fontSize: 13, textAlign: 'center' }}>{error}</p>}
      </div>

      {/* Bouton créer */}
      <div style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))', left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #E5E1DA', zIndex: 60 }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || saving}
          style={{ width: '100%', height: 48, borderRadius: 8, border: 'none', cursor: canSubmit && !saving ? 'pointer' : 'default', backgroundColor: canSubmit && !saving ? '#1A1A18' : '#E5E1DA', color: canSubmit && !saving ? '#fff' : '#A09890', fontSize: 15, fontWeight: 600 }}
        >
          {saving
            ? 'Création en cours…'
            : recurrence !== 'none' && recurrenceEndType === 'infinite'
              ? 'Créer la récurrence'
              : recurrence !== 'none' && occurrencePreview
                ? `Créer ${occurrencePreview} séances`
                : 'Créer la séance'}
        </button>
      </div>
    </>
  )
}

// ─── Page (Suspense requis pour useSearchParams) ─────────────────────────────

export default function NewSessionPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60dvh' }}>
        <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
      </div>
    }>
      <NewSessionForm />
    </Suspense>
  )
}
