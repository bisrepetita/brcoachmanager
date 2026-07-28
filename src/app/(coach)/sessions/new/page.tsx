'use client'

import { Suspense, useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, addMinutes } from 'date-fns'
import { orderBy, Timestamp, writeBatch, doc, collection, serverTimestamp, addDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { X, Check, Search, RefreshCw, UserPlus, Dumbbell, Users2 } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { createDoc, updateDocById } from '@/lib/services/crud.service'
import { sendNotification } from '@/lib/services/notification.service'
import { logActivity } from '@/lib/services/activity.service'
import {
  computeDiscountedAmount, matchesScope, findActiveClientDiscount,
  lookupPromoCode, checkUsageLimits, recordRedemption, discountLabel,
} from '@/lib/services/discount.service'
import { format as formatDate } from 'date-fns'
import { fr } from 'date-fns/locale'
import { GROUP_SESSION_LEVEL_LABELS, type Service, type Location, type User, type Client, type ClientGroup, type ClientPayment, type Discount, type GroupSessionLevel } from '@/types'

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

// Marque les clients comme ayant déjà réservé (empêche toute offre "1ère réservation" ultérieure,
// sur ce service ou un autre) — appelé après toute création de séance, offerte ou non.
async function markClientsAsBooked(clientIds: string[], clients: Client[]): Promise<void> {
  const toMark = clientIds.filter(id => !clients.find(c => c.id === id)?.hasEverBooked)
  await Promise.all(toMark.map(id => updateDocById('clients', id, { hasEverBooked: true })))
}

const DURATIONS = [30, 45, 50, 60, 75, 90, 120] as const
type SessionMode = 'standard' | 'training'
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

  const [sessionMode, setSessionMode] = useState<SessionMode>('standard')
  const isTraining = sessionMode === 'training'
  const [isPublic, setIsPublic] = useState(() => searchParams.get('public') === '1')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [maxParticipants, setMaxParticipants] = useState(8)
  const [price, setPrice] = useState(20)
  const [level, setLevel] = useState<GroupSessionLevel | ''>('')
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
  const [showNewClient, setShowNewClient] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [locationBookings, setLocationBookings] = useState<Record<string, number>>({})
  const [clientDiscounts, setClientDiscounts] = useState<Record<string, Discount>>({})
  const [promoCodeInput, setPromoCodeInput] = useState('')
  const [appliedPromoCode, setAppliedPromoCode] = useState<Discount | null>(null)
  const [promoCodeError, setPromoCodeError] = useState('')
  const [checkingPromo, setCheckingPromo] = useState(false)

  const { data: allServices } = useCollection<Service>('services', [orderBy('name')])
  const { data: allLocations } = useCollection<Location>('locations', [orderBy('name')])
  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  const services = useMemo(() => allServices
    .filter(s => {
      if (s.active === false) return false
      if (!s.assignedCoachIds || s.assignedCoachIds.length === 0) return true
      if (isAdmin) return true
      return user?.id ? s.assignedCoachIds.includes(user.id) : false
    })
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)),
  [allServices, isAdmin, user?.id])
  const locations = useMemo(() =>
    allLocations
      .filter(l => l.active !== false)
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.name.localeCompare(b.name)),
  [allLocations])
  const trainingLocations = useMemo(() => locations.filter(l => l.allowCoachTraining), [locations])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  useEffect(() => {
    if (user?.id) setCoachIds([user.id])
  }, [user?.id])

  // Vérifie la disponibilité des lieux pour le créneau sélectionné
  useEffect(() => {
    if (!date || !startTime) { setLocationBookings({}); return }
    const [yr, mo, dy] = date.split('-').map(Number)
    const [hh, mm] = startTime.split(':').map(Number)
    const slotStart = new Date(yr!, mo! - 1, dy!, hh, mm, 0).getTime()
    const slotEnd = slotStart + duration * 60000
    // Fenêtre : on remonte 12h pour capter les séances qui ont démarré la veille et
    // se terminent pendant le créneau. La borne haute exclut les séances qui commencent
    // exactement à slotEnd (startAt < slotEnd), ce qui est voulu.
    const windowStart = new Date(slotStart - 12 * 60 * 60 * 1000)
    const windowEnd = new Date(slotEnd)

    Promise.all([
      getDocs(query(
        collection(db, 'sessions'),
        where('startAt', '>=', Timestamp.fromDate(windowStart)),
        where('startAt', '<', Timestamp.fromDate(windowEnd)),
      )),
      getDocs(query(
        collection(db, 'groupSessions'),
        where('startAt', '>=', Timestamp.fromDate(windowStart)),
        where('startAt', '<', Timestamp.fromDate(windowEnd)),
      )),
    ]).then(([sessionsSnap, groupSessionsSnap]) => {
      const bookings: Record<string, number> = {}
      for (const d of [...sessionsSnap.docs, ...groupSessionsSnap.docs]) {
        const s = d.data()
        if (s.status === 'cancelled') continue
        const sStart = (s.startAt as Timestamp).toDate().getTime()
        const sEnd = (s.endAt as Timestamp).toDate().getTime()
        // Chevauchement strict : sEnd == slotStart (séance adjacente) n'est PAS un conflit
        if (sStart < slotEnd && sEnd > slotStart) {
          const lid = s.locationId as string
          if (lid) bookings[lid] = (bookings[lid] ?? 0) + 1
        }
      }
      setLocationBookings(bookings)
    }).catch(err => console.error('[location-check]', err))
  }, [date, startTime, duration])

  const selectedService = useMemo(() => services.find(s => s.id === serviceId), [services, serviceId])

  const filteredClients = useMemo(() =>
    clients.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  )

  // Clients effectifs pour la séance en cours (individuel ou groupe fixe) — utilisé à la fois
  // pour la détection des rabais et pour la construction du paymentDistribution à la soumission
  const finalClientIds = useMemo(() => {
    if (clientMode === 'group' && selectedGroupId) {
      return groups.find(g => g.id === selectedGroupId)?.clientIds ?? []
    }
    return selectedClientIds
  }, [clientMode, selectedGroupId, selectedClientIds, groups])

  // Auto-détection des rabais client actifs pour le service sélectionné (mode standard uniquement)
  useEffect(() => {
    setAppliedPromoCode(null); setPromoCodeInput(''); setPromoCodeError('')
    if (isTraining || isPublic || !selectedService || finalClientIds.length === 0) { setClientDiscounts({}); return }
    let cancelled = false
    Promise.all(finalClientIds.map(async (cId) => [cId, await findActiveClientDiscount(cId, selectedService)] as const))
      .then(results => {
        if (cancelled) return
        const map: Record<string, Discount> = {}
        for (const [cId, d] of results) if (d) map[cId] = d
        setClientDiscounts(map)
      })
    return () => { cancelled = true }
  }, [isTraining, isPublic, selectedService, finalClientIds])

  async function handleApplyPromoCode() {
    if (!promoCodeInput.trim() || !selectedService) return
    setCheckingPromo(true); setPromoCodeError('')
    try {
      const found = await lookupPromoCode(promoCodeInput)
      if (!found || !matchesScope(found.scope, selectedService)) {
        setPromoCodeError('Code invalide ou non applicable à ce service.')
        return
      }
      const check = await checkUsageLimits(found, finalClientIds[0] ?? '')
      if (!check.ok) { setPromoCodeError(check.error); return }
      setAppliedPromoCode(found)
    } finally {
      setCheckingPromo(false)
    }
  }

  const canSubmit = isTraining
    ? !!(locationId && coachIds.length > 0 && date && startTime)
    : isPublic
      ? !!(serviceId && title.trim() && locationId && coachIds.length > 0 && date && startTime && maxParticipants > 0)
      : !!(serviceId && locationId && coachIds.length > 0 && date && startTime &&
          (clientMode === 'group' ? selectedGroupId : selectedClientIds.length > 0))

  // Séance publique : titre/prix hérités du service choisi (modifiables ensuite)
  useEffect(() => {
    if (!isPublic || !serviceId) return
    const svc = services.find(s => s.id === serviceId)
    if (!svc) return
    setTitle(svc.name)
    setPrice(svc.price)
  }, [isPublic, serviceId, services])

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

  const handleCreateClient = useCallback(async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return
    setCreatingClient(true)
    try {
      const newId = await createDoc('clients', {
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        phone: newPhone.trim(),
        sessionCredits: 0,
        visibleToCoachIds: isAdmin ? [] : (user?.id ? [user.id] : []),
      })
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'client_created', description: `${newFirstName.trim()} ${newLastName.trim()}`, clientId: newId })
      setSelectedClientIds(prev => [...prev, newId])
      setNewFirstName(''); setNewLastName(''); setNewPhone('')
      setShowNewClient(false)
    } finally {
      setCreatingClient(false)
    }
  }, [newFirstName, newLastName, newPhone, isAdmin, user])

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    if (!isTraining && !selectedService) return
    setSaving(true)
    setError('')
    try {
      const [yr, mo, dy] = date.split('-').map(Number)
      const [hh, mm] = startTime.split(':').map(Number)
      const startDate = new Date(yr!, mo! - 1, dy!, hh, mm, 0)
      const endDate = addMinutes(startDate, duration)

      // ── Mode entraînement coach ──────────────────────────────────────────────
      if (isTraining) {
        const sessionId = await createDoc('sessions', {
          sessionType: 'coach_training',
          coachIds,
          clientIds: [],
          locationId,
          serviceId: '',
          isIndependent: false,
          status: 'planned',
          paymentStatus: 'offered',
          paymentDistribution: [],
          priceSnapshot: { serviceName: 'Entraînement', basePrice: 0, pricingMode: 'per_person' },
          startAt: Timestamp.fromDate(startDate),
          endAt: Timestamp.fromDate(endDate),
        } as Record<string, unknown>)
        logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_created', description: `Entraînement · ${formatDate(startDate, 'd MMM yyyy HH:mm', { locale: fr })}`, sessionId })
        router.replace(`/sessions/${sessionId}` as never)
        return
      }

      // ── Séance collective publique ───────────────────────────────────────────
      if (isPublic) {
        const baseGroupData = {
          serviceId,
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          coachIds,
          coachNames: coachIds.map(cId => coaches.find(c => c.id === cId)?.firstName).filter((n): n is string => !!n),
          locationId,
          maxParticipants,
          price,
          ...(level ? { level } : {}),
          startTime,
          status: 'planned' as const,
          isPublic: true,
        }

        if (recurrence === 'none') {
          const groupSessionId = await createDoc('groupSessions', {
            ...baseGroupData,
            dayOfWeek: startDate.getDay(),
            startAt: Timestamp.fromDate(startDate),
            endAt: Timestamp.fromDate(endDate),
            enrollments: [],
            createdBy: user!.id,
          } as Record<string, unknown>)

          logActivity({
            userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName,
            action: 'session_created',
            description: `Séance collective "${title.trim()}" créée (${maxParticipants} places)`,
            sessionId: groupSessionId,
          })

          router.replace(`/manage-group-sessions/${groupSessionId}` as never)
          return
        }

        // Récurrence
        const isInfinitePublic = recurrenceEndType === 'infinite'
        const endConditionPublic: { type: 'months'; count: number } | { type: 'count'; count: number } =
          recurrenceEndType === 'count'
            ? { type: 'count', count: recurrenceCount }
            : { type: 'months', count: recurrenceEndType === '3months' ? 3 : recurrenceEndType === '6months' ? 6 : 12 }

        const generationEndPublic = isInfinitePublic ? { type: 'months' as const, count: 3 } : endConditionPublic
        const occurrencesPublic = generateOccurrenceDates(startDate, recurrence, generationEndPublic)

        const recurrenceRef = await addDoc(collection(db, 'groupSessionRecurrences'), {
          serviceId,
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          coachIds,
          coachNames: coachIds.map(cId => coaches.find(c => c.id === cId)?.firstName).filter((n): n is string => !!n),
          locationId,
          maxParticipants,
          price,
          ...(level ? { level } : {}),
          isPublic: true,
          createdBy: user!.id,
          rule: {
            frequency: recurrence,
            dayOfWeek: startDate.getDay(),
            startTime,
            duration,
            startDate: Timestamp.fromDate(startDate),
            infinite: isInfinitePublic,
            ...(!isInfinitePublic && endConditionPublic.type === 'months'
              ? { endDate: Timestamp.fromDate(new Date(startDate.getFullYear(), startDate.getMonth() + endConditionPublic.count, startDate.getDate())) }
              : {}),
            ...(!isInfinitePublic && endConditionPublic.type === 'count'
              ? { count: endConditionPublic.count }
              : {}),
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })

        const groupBatch = writeBatch(db)
        let firstGroupSessionId: string | null = null

        for (const occDate of occurrencesPublic) {
          const gsRef = doc(collection(db, 'groupSessions'))
          if (!firstGroupSessionId) firstGroupSessionId = gsRef.id
          groupBatch.set(gsRef, {
            ...baseGroupData,
            dayOfWeek: occDate.getDay(),
            startAt: Timestamp.fromDate(occDate),
            endAt: Timestamp.fromDate(addMinutes(occDate, duration)),
            enrollments: [],
            recurrenceId: recurrenceRef.id,
            createdBy: user!.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }

        await groupBatch.commit()
        logActivity({
          userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName,
          action: 'session_created',
          description: `Séance collective "${title.trim()}" · récurrence (${occurrencesPublic.length} séances)`,
          sessionId: firstGroupSessionId!,
        })
        router.replace(`/manage-group-sessions/${firstGroupSessionId}` as never)
        return
      }

      // ── Mode standard ────────────────────────────────────────────────────────
      const finalGroupId = clientMode === 'group' && selectedGroupId ? selectedGroupId : undefined

      const pricePerClient = selectedService!.pricingMode === 'per_person'
        ? selectedService!.price
        : finalClientIds.length > 0 ? Math.round((selectedService!.price / finalClientIds.length) * 100) / 100 : 0

      const baseSessionData = {
        coachIds,
        clientIds: finalClientIds,
        ...(finalGroupId ? { clientGroupId: finalGroupId } : {}),
        locationId,
        serviceId,
        isIndependent,
        status: 'planned',
        paymentStatus: 'payment_to_request',
        priceSnapshot: {
          serviceName: selectedService!.name,
          basePrice: selectedService!.price,
          pricingMode: selectedService!.pricingMode,
        },
        ...(isIndependent ? {
          roomRentalSnapshot: coachIds.map(cId => ({
            coachId: cId,
            amountDueToCompany: selectedService!.independentRoomRentalPrice,
            status: 'pending',
          })),
        } : {}),
      }

      if (recurrence === 'none') {
        // Séance unique — les remises (rabais client auto-détecté ou code promo) ne s'appliquent
        // qu'ici, jamais aux séances récurrentes générées ci-dessous (éviterait d'épuiser en
        // quelques semaines une limite d'usage prévue pour une seule séance).
        const paymentDistribution: ClientPayment[] = await Promise.all(finalClientIds.map(async (cId) => {
          if (selectedService!.firstBookingFree && !clients.find(c => c.id === cId)?.hasEverBooked) {
            return {
              clientId: cId, amountDue: 0, amountPaid: 0, paymentStatus: 'offered' as const,
              originalAmountDue: pricePerClient, discountLabel: 'Première réservation offerte',
            }
          }
          const candidate = clientDiscounts[cId] ?? appliedPromoCode
          if (!candidate) {
            return { clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request' as const }
          }
          const check = await checkUsageLimits(candidate, cId)
          if (!check.ok) {
            return { clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request' as const }
          }
          return {
            clientId: cId, amountDue: computeDiscountedAmount(pricePerClient, candidate), amountPaid: 0,
            paymentStatus: 'payment_to_request' as const,
            discountId: candidate.id, discountLabel: discountLabel(candidate), originalAmountDue: pricePerClient,
          }
        }))

        const sessionId = await createDoc('sessions', {
          ...baseSessionData,
          paymentDistribution,
          startAt: Timestamp.fromDate(startDate),
          endAt: Timestamp.fromDate(endDate),
        } as Record<string, unknown>)

        await Promise.all(paymentDistribution
          .filter(p => p.discountId)
          .map(p => recordRedemption({
            discountId: p.discountId!, clientId: p.clientId, context: 'session', refId: sessionId,
            amountBefore: p.originalAmountDue!, amountAfter: p.amountDue,
          })))

        await markClientsAsBooked(finalClientIds, clients)

        // Notifier les coachs assignés (sauf celui qui crée)
        const otherCoachIds = coachIds.filter(id => id !== user?.id)
        if (otherCoachIds.length > 0) {
          sendNotification({
            userIds: otherCoachIds,
            title: 'Nouvelle séance',
            body: `${selectedService!.name} · ${formatDate(startDate, 'd MMM yyyy HH:mm', { locale: fr })}`,
            link: `/sessions/${sessionId}`,
          })
        }

        logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_created', description: `${selectedService!.name} · ${formatDate(startDate, 'd MMM yyyy HH:mm', { locale: fr })}`, sessionId })
        router.replace(`/sessions/${sessionId}` as never)
        return
      }

      // Pas de remise sur les occurrences récurrentes (cf. commentaire ci-dessus)
      const paymentDistribution: ClientPayment[] = finalClientIds.map(cId => ({
        clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request',
      }))

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
          paymentDistribution,
          startAt: Timestamp.fromDate(occDate),
          endAt: Timestamp.fromDate(addMinutes(occDate, duration)),
          recurrenceId: recurrenceRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      }

      await batch.commit()
      await markClientsAsBooked(finalClientIds, clients)
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_created', description: `${selectedService!.name} · récurrence (${occurrences.length} séances)`, sessionId: firstSessionId! })
      router.replace(`/sessions/${firstSessionId}` as never)
    } catch (e) {
      console.error(e)
      setError('Erreur lors de la création. Réessaie.')
      setSaving(false)
    }
  }, [canSubmit, isTraining, isPublic, title, description, maxParticipants, price, selectedService, date, startTime, duration, selectedClientIds, selectedGroupId, clientMode, groups, coachIds, locationId, serviceId, isIndependent, recurrence, recurrenceEndType, recurrenceCount, router, user, finalClientIds, clientDiscounts, appliedPromoCode, clients])

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

        {/* Mode séance */}
        <div style={{ display: 'flex', gap: 8 }}>
          {([['standard', 'Séance', Users2], ['training', 'Entraînement', Dumbbell]] as [SessionMode, string, typeof Dumbbell][]).map(([mode, label, Icon]) => (
            <button
              key={mode}
              onClick={() => { setSessionMode(mode); setLocationId(''); if (mode === 'training') setIsPublic(false) }}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500,
                backgroundColor: sessionMode === mode ? '#1A1A18' : '#fff',
                color: sessionMode === mode ? '#fff' : '#7A7570',
                boxShadow: sessionMode === mode ? 'none' : '0 0 0 1px #E5E1DA',
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Séance publique (collective) — mode standard uniquement */}
        {!isTraining && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>Séance publique (collective)</p>
              <p style={{ fontSize: 12, color: '#7A7570', margin: '2px 0 0' }}>Les clients s&apos;inscrivent et paient eux-mêmes en ligne</p>
            </div>
            <Toggle value={isPublic} onChange={setIsPublic} />
          </div>
        )}

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

        {/* Service — mode standard uniquement (public ou non) */}
        {!isTraining && (
          <Section title="Service">
            {services.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun service actif</p>}
            {services.map(s => (
              <SelectItem
                key={s.id}
                label={s.name}
                sub={s.isPublic ? `${s.price.toFixed(2)} CHF · Public` : `${s.price.toFixed(2)} CHF`}
                selected={serviceId === s.id}
                onSelect={() => { setServiceId(s.id); if (s.isPublic) setIsPublic(true) }}
              />
            ))}
          </Section>
        )}

        {/* Informations — mode public uniquement : titre/description hérités du service, modifiables */}
        {!isTraining && isPublic && (
          <Section title="Informations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                style={inputStyle}
                placeholder="Titre (ex: Cours collectif renforcement)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                style={{ ...inputStyle, height: 64, padding: '8px 10px', resize: 'none' }}
                placeholder="Description (optionnel)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </Section>
        )}

        {/* Lieu */}
        <Section title="Lieu">
          {isTraining ? (
            trainingLocations.length === 0 ? (
              <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>
                Aucun lieu autorisé pour l&apos;entraînement — configure-les dans Admin → Lieux
              </p>
            ) : (
              trainingLocations.map(l => {
                const booked = locationBookings[l.id] ?? 0
                const maxSim = l.maxSimultaneous ?? 1
                const full = l.allowMultipleBookings && maxSim === 0 ? false : booked >= (l.allowMultipleBookings ? maxSim : 1)
                const maxSim2 = l.allowMultipleBookings ? (l.maxSimultaneous ?? 1) : 1
                const sub = l.address
                  ? full ? `${l.address} · Complet (${booked}/${maxSim2})` : l.address
                  : full ? `Complet (${booked}/${maxSim2})` : undefined
                return (
                  <div key={l.id} style={{ opacity: full ? 0.45 : 1 }}>
                    <SelectItem label={l.name} sub={sub} selected={locationId === l.id} onSelect={() => !full && setLocationId(l.id)} />
                  </div>
                )
              })
            )
          ) : (
            <>
              {locations.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun lieu actif</p>}
              {locations.map(l => {
                const booked = locationBookings[l.id] ?? 0
                const maxSim = l.maxSimultaneous ?? 1
                const full = l.allowMultipleBookings && maxSim === 0 ? false : booked >= (l.allowMultipleBookings ? maxSim : 1)
                const maxSim2 = l.allowMultipleBookings ? (l.maxSimultaneous ?? 1) : 1
                const sub = l.address
                  ? full ? `${l.address} · Complet (${booked}/${maxSim2})` : l.address
                  : full ? `Complet (${booked}/${maxSim2})` : undefined
                return (
                  <div key={l.id} style={{ opacity: full ? 0.45 : 1 }}>
                    <SelectItem label={l.name} sub={sub} selected={locationId === l.id} onSelect={() => !full && setLocationId(l.id)} />
                  </div>
                )
              })}
            </>
          )}
        </Section>

        {/* Places & prix — mode public uniquement */}
        {!isTraining && isPublic && (
          <Section title="Places & prix">
            <Row label="Nombre max de places">
              <input
                type="number" min={1} style={{ ...inputStyle, width: 90 }}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Math.max(1, Number(e.target.value)))}
              />
            </Row>
            <Row label="Prix par personne (CHF)">
              <input
                type="number" min={0} step={5} style={{ ...inputStyle, width: 90 }}
                value={price}
                onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
              />
            </Row>
          </Section>
        )}

        {/* Niveau — mode public uniquement, optionnel */}
        {!isTraining && isPublic && (
          <Section title="Niveau">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(Object.entries(GROUP_SESSION_LEVEL_LABELS) as [GroupSessionLevel, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setLevel(l => l === val ? '' : val)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: level === val ? '#1A1A18' : '#F0EDE8', color: level === val ? '#fff' : '#1A1A18' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Clients — mode standard non-public uniquement */}
        {isTraining || isPublic ? null : <Section title="Clients">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {(['individual', 'group'] as ClientMode[]).map(m => (
              <button key={m} onClick={() => setClientMode(m)} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: clientMode === m ? '#1A1A18' : '#F0EDE8', color: clientMode === m ? '#fff' : '#1A1A18' }}>
                {m === 'individual' ? 'Individuel' : 'Groupe'}
              </button>
            ))}
          </div>
          {clientMode === 'individual' ? (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7A7570', pointerEvents: 'none' }} />
                  <input type="text" placeholder="Rechercher un client..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 30 }} />
                </div>
                <button
                  onClick={() => { setShowNewClient(v => !v); setNewFirstName(''); setNewLastName(''); setNewPhone('') }}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: showNewClient ? '#1A1A18' : '#F0EDE8', borderColor: showNewClient ? '#1A1A18' : '#E5E1DA' }}
                  title="Nouveau client"
                >
                  <UserPlus size={15} color={showNewClient ? '#fff' : '#7A7570'} />
                </button>
              </div>

              {showNewClient && (
                <div style={{ background: '#F9F8F6', borderRadius: 8, padding: '10px 10px 12px', marginBottom: 8, border: '1px solid #E5E1DA' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#7A7570', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Nouveau client</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input placeholder="Prénom *" value={newFirstName} onChange={e => setNewFirstName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                    <input placeholder="Nom *" value={newLastName} onChange={e => setNewLastName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <input placeholder="Téléphone" value={newPhone} onChange={e => setNewPhone(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                  <button
                    onClick={handleCreateClient}
                    disabled={!newFirstName.trim() || !newLastName.trim() || creatingClient}
                    style={{ width: '100%', height: 34, borderRadius: 8, border: 'none', cursor: newFirstName.trim() && newLastName.trim() && !creatingClient ? 'pointer' : 'default', background: newFirstName.trim() && newLastName.trim() ? '#1A1A18' : '#E5E1DA', color: newFirstName.trim() && newLastName.trim() ? '#fff' : '#A09890', fontSize: 13, fontWeight: 600 }}
                  >
                    {creatingClient ? 'Création…' : 'Créer et sélectionner'}
                  </button>
                </div>
              )}

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
        </Section>}

        {/* Remise — mode standard uniquement, quand service + client(s) sélectionnés */}
        {!isTraining && !isPublic && serviceId && finalClientIds.length > 0 && (
          <Section title="Remise">
            {selectedService?.firstBookingFree && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                {finalClientIds.filter(id => !clients.find(c => c.id === id)?.hasEverBooked).map(id => {
                  const c = clients.find(cl => cl.id === id)
                  return (
                    <p key={id} style={{ fontSize: 13, color: '#2D7A4F', margin: 0 }}>
                      {c ? `${c.firstName} ${c.lastName}` : id} — 1ère réservation offerte
                    </p>
                  )
                })}
              </div>
            )}
            {Object.keys(clientDiscounts).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                {finalClientIds.filter(id => clientDiscounts[id]).map(id => {
                  const c = clients.find(cl => cl.id === id)
                  const d = clientDiscounts[id]!
                  return (
                    <p key={id} style={{ fontSize: 13, color: '#2D7A4F', margin: 0 }}>
                      {c ? `${c.firstName} ${c.lastName}` : id} — {d.discountType === 'percentage' ? `-${d.value}%` : `-${d.value.toFixed(2)} CHF`} ({discountLabel(d)})
                    </p>
                  )
                })}
              </div>
            )}
            {appliedPromoCode ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#E8F3EE', borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: '#2D7A4F' }}>Code {appliedPromoCode.code} appliqué</span>
                <button onClick={() => { setAppliedPromoCode(null); setPromoCodeInput('') }} style={{ background: 'none', border: 'none', color: '#2D7A4F', cursor: 'pointer', fontSize: 12 }}>Retirer</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  style={inputStyle}
                  placeholder="Code promo (optionnel)"
                  value={promoCodeInput}
                  onChange={(e) => { setPromoCodeInput(e.target.value.toUpperCase()); setPromoCodeError('') }}
                />
                <button
                  onClick={handleApplyPromoCode}
                  disabled={checkingPromo || !promoCodeInput.trim()}
                  style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, cursor: 'pointer', flexShrink: 0 }}
                >
                  {checkingPromo ? '…' : 'Appliquer'}
                </button>
              </div>
            )}
            {promoCodeError && <p style={{ fontSize: 12, color: '#C0392B', margin: '6px 0 0' }}>{promoCodeError}</p>}
          </Section>
        )}

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

        {/* Mode indépendant — standard non-public uniquement */}
        {!isTraining && !isPublic && <Section title="Mode">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
            <div>
              <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>Mode indépendant</p>
              <p style={{ fontSize: 12, color: '#7A7570', margin: '2px 0 0' }}>Location de salle facturée au coach</p>
            </div>
            <Toggle value={isIndependent} onChange={setIsIndependent} />
          </div>
        </Section>}

        {/* Récurrence — standard uniquement */}
        {!isTraining && <Section title="Récurrence">
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
        </Section>}

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
            : isTraining
              ? 'Réserver l\'entraînement'
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
