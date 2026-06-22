'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { format, addMinutes } from 'date-fns'
import { orderBy, Timestamp, doc, getDoc, updateDoc, getDocs, query, collection, where, writeBatch, serverTimestamp } from 'firebase/firestore'
import { Check, Search } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { db } from '@/lib/firebase/firestore'
import { logActivity } from '@/lib/services/activity.service'
import type { Service, Location, User, Client, ClientGroup, Session, ClientPayment } from '@/types'

const inputStyle: React.CSSProperties = {
  height: 36, border: '1px solid #E5E1DA', borderRadius: 8,
  padding: '0 10px', fontSize: 14, color: '#1A1A18',
  background: '#F9F8F6', outline: 'none', width: '100%',
}

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

type Scope = 'single' | 'following' | 'all'

const DURATIONS = [30, 45, 60, 75, 90, 120] as const

export default function EditSessionPage() {
  const router = useRouter()
  const params = useParams()
  const sessionId = params.id as string
  const { user } = useAuth()

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const [serviceId, setServiceId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [coachIds, setCoachIds] = useState<string[]>([])
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [clientSearch, setClientSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showScopeModal, setShowScopeModal] = useState(false)

  const { data: allServices } = useCollection<Service>('services', [orderBy('name')])
  const { data: allLocations } = useCollection<Location>('locations', [orderBy('name')])
  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])
  const { data: clients } = useCollection<Client>('clients', [orderBy('firstName')])
  const { data: groups } = useCollection<ClientGroup>('clientGroups', [orderBy('name')])

  const services = useMemo(() => allServices.filter(s => {
    if (s.active === false) return false
    if (!s.assignedCoachIds || s.assignedCoachIds.length === 0) return true
    if (isAdmin) return true
    return user?.id ? s.assignedCoachIds.includes(user.id) : false
  }), [allServices, isAdmin, user?.id])
  const locations = useMemo(() => allLocations.filter(l => l.active !== false), [allLocations])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  useEffect(() => {
    getDoc(doc(db, 'sessions', sessionId)).then(snap => {
      if (!snap.exists()) { setLoading(false); return }
      const s = { id: snap.id, ...snap.data() } as Session
      setSession(s)
      const start = s.startAt.toDate()
      const end = s.endAt.toDate()
      const mins = Math.round((end.getTime() - start.getTime()) / 60000)
      setServiceId(s.serviceId)
      setLocationId(s.locationId)
      setCoachIds(s.coachIds)
      setSelectedClientIds(s.clientIds)
      setDate(format(start, 'yyyy-MM-dd'))
      setStartTime(format(start, 'HH:mm'))
      setDuration(DURATIONS.includes(mins as typeof DURATIONS[number]) ? mins : 60)
      setLoading(false)
    })
  }, [sessionId])

  const selectedService = useMemo(() => services.find(s => s.id === serviceId), [services, serviceId])
  const filteredClients = useMemo(() =>
    clients.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(clientSearch.toLowerCase())),
    [clients, clientSearch]
  )

  const canSubmit = !!(serviceId && locationId && coachIds.length > 0 && date && startTime && selectedClientIds.length > 0)

  const doSave = useCallback(async (scope: Scope) => {
    if (!canSubmit || !selectedService || !session) return
    setSaving(true)
    setError('')
    setShowScopeModal(false)
    try {
      const [yr, mo, dy] = date.split('-').map(Number)
      const [hh, mm] = startTime.split(':').map(Number)
      const startDate = new Date(yr!, mo! - 1, dy!, hh, mm, 0)
      const endDate = addMinutes(startDate, duration)

      const pricePerClient = selectedService.pricingMode === 'per_person'
        ? selectedService.price
        : selectedClientIds.length > 0 ? Math.round((selectedService.price / selectedClientIds.length) * 100) / 100 : 0

      const buildPaymentDistribution = (existingDist: ClientPayment[]): ClientPayment[] =>
        selectedClientIds.map(cId => {
          const existing = existingDist.find(p => p.clientId === cId)
          return existing
            ? { ...existing, amountDue: pricePerClient }
            : { clientId: cId, amountDue: pricePerClient, amountPaid: 0, paymentStatus: 'payment_to_request' as const }
        })

      if (scope === 'single' || !session.recurrenceId) {
        await updateDoc(doc(db, 'sessions', sessionId), {
          serviceId, locationId, coachIds, clientIds: selectedClientIds,
          startAt: Timestamp.fromDate(startDate),
          endAt: Timestamp.fromDate(endDate),
          paymentDistribution: buildPaymentDistribution(session.paymentDistribution ?? []),
          priceSnapshot: { serviceName: selectedService.name, basePrice: selectedService.price, pricingMode: selectedService.pricingMode },
          updatedAt: serverTimestamp(),
        })
      } else {
        // Récupérer toutes les séances de la récurrence (filtrage JS pour éviter les index composites)
        const q = query(collection(db, 'sessions'), where('recurrenceId', '==', session.recurrenceId))
        const snap = await getDocs(q)
        const batch = writeBatch(db)

        snap.docs.filter(d => {
          const s = d.data() as Session
          if (s.status !== 'planned') return false
          if (scope === 'following') return s.startAt.seconds >= session.startAt.seconds
          return true
        }).forEach(d => {
          const s = d.data() as Session
          const origStart = s.startAt.toDate()
          // Garder la date d'origine, appliquer la nouvelle heure
          const newStart = new Date(origStart.getFullYear(), origStart.getMonth(), origStart.getDate(), hh, mm, 0)
          const newEnd = addMinutes(newStart, duration)

          batch.update(doc(db, 'sessions', d.id), {
            serviceId, locationId, coachIds, clientIds: selectedClientIds,
            startAt: Timestamp.fromDate(newStart),
            endAt: Timestamp.fromDate(newEnd),
            paymentDistribution: buildPaymentDistribution(s.paymentDistribution ?? []),
            priceSnapshot: { serviceName: selectedService.name, basePrice: selectedService.price, pricingMode: selectedService.pricingMode },
            updatedAt: serverTimestamp(),
          })
        })

        await batch.commit()
      }

      const scopeLabel = scope === 'single' ? 'cette séance' : scope === 'following' ? 'cette séance et les suivantes' : 'toutes les séances'
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'session_edited', description: `${selectedService.name} · ${scopeLabel}`, sessionId })
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSaving(false)
    }
  }, [canSubmit, selectedService, session, date, startTime, duration, serviceId, locationId, coachIds, selectedClientIds, sessionId, router, user])

  const handleSave = useCallback(() => {
    if (!canSubmit || !session) return
    if (session.recurrenceId) {
      setShowScopeModal(true)
    } else {
      doSave('single')
    }
  }, [canSubmit, session, doSave])

  if (loading) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Chargement…</div>
  if (!session) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Séance introuvable</div>

  const isAdmin = user?.roles?.includes('admin') ?? false

  return (
    <>
      <TopBar
        title="Modifier la séance"
        left={<button onClick={() => router.back()} className="p-2 -ml-1 text-text-secondary">Annuler</button>}
        right={
          <button
            onClick={handleSave}
            disabled={!canSubmit || saving}
            style={{
              fontSize: 14, fontWeight: 600, color: canSubmit && !saving ? '#1A1A18' : '#A09890',
              background: 'none', border: 'none', cursor: canSubmit && !saving ? 'pointer' : 'default',
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && <p style={{ color: '#EF4444', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        {/* Date & heure */}
        <Section title="Date & heure">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, flex: 2 }} />
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DURATIONS.map(d => (
              <button
                key={d}
                onClick={() => setDuration(d)}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: 13, border: '1px solid',
                  borderColor: duration === d ? '#1A1A18' : '#E5E1DA',
                  background: duration === d ? '#1A1A18' : 'transparent',
                  color: duration === d ? '#fff' : '#1A1A18', cursor: 'pointer',
                }}
              >
                {d} min
              </button>
            ))}
          </div>
        </Section>

        {/* Service */}
        <Section title="Service">
          {services.map(s => (
            <SelectItem key={s.id} label={s.name} sub={`CHF ${s.price}`} selected={serviceId === s.id} onSelect={() => setServiceId(s.id)} />
          ))}
        </Section>

        {/* Lieu */}
        <Section title="Lieu">
          {locations.map(l => (
            <SelectItem key={l.id} label={l.name} selected={locationId === l.id} onSelect={() => setLocationId(l.id)} />
          ))}
        </Section>

        {/* Coachs */}
        {isAdmin && (
          <Section title="Coachs">
            {coaches.map(c => {
              const sel = coachIds.includes(c.id)
              return (
                <SelectItem
                  key={c.id}
                  label={`${c.firstName} ${c.lastName}`}
                  selected={sel}
                  multi
                  onSelect={() => setCoachIds(sel ? coachIds.filter(id => id !== c.id) : [...coachIds, c.id])}
                />
              )
            })}
          </Section>
        )}

        {/* Clients */}
        <Section title="Clients">
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A09890' }} />
            <input
              placeholder="Rechercher…"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
          {filteredClients.map(c => {
            const sel = selectedClientIds.includes(c.id)
            const groupName = groups.find(g => g.clientIds.includes(c.id))?.name
            return (
              <SelectItem
                key={c.id}
                label={`${c.firstName} ${c.lastName}`}
                sub={groupName}
                selected={sel}
                multi
                onSelect={() => setSelectedClientIds(sel ? selectedClientIds.filter(id => id !== c.id) : [...selectedClientIds, c.id])}
              />
            )
          })}
        </Section>
      </div>

      {/* Modal choix de portée pour séances récurrentes */}
      {showScopeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowScopeModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px', width: '100%', maxWidth: 480 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1A1A18', marginBottom: 4 }}>Modifier l'événement récurrent</p>
            <p style={{ fontSize: 13, color: '#7A7570', marginBottom: 16 }}>Quelle séance souhaitez-vous modifier ?</p>
            {([
              ['single', 'Cette séance uniquement'],
              ['following', 'Cette séance et les suivantes'],
              ['all', 'Toutes les séances'],
            ] as [Scope, string][]).map(([scope, label]) => (
              <button key={scope} onClick={() => doSave(scope)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 14px', borderRadius: 10, border: '1px solid #E5E1DA', background: '#F9F8F6', fontSize: 14, color: '#1A1A18', fontWeight: 500, marginBottom: 8, cursor: 'pointer' }}>
                {label}
              </button>
            ))}
            <button onClick={() => setShowScopeModal(false)}
              style={{ display: 'block', width: '100%', textAlign: 'center', padding: '13px', borderRadius: 10, border: 'none', background: 'transparent', fontSize: 14, color: '#7A7570', cursor: 'pointer', marginTop: 4 }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  )
}
