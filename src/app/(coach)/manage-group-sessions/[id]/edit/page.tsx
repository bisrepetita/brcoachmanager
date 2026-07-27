'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { addMinutes } from 'date-fns'
import { format } from 'date-fns'
import {
  orderBy, Timestamp, doc, getDoc, updateDoc, addDoc, getDocs, query,
  collection, where, writeBatch, serverTimestamp, deleteField,
} from 'firebase/firestore'
import { Check, RefreshCw } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { db } from '@/lib/firebase/firestore'
import { logActivity } from '@/lib/services/activity.service'
import { GROUP_SESSION_LEVEL_LABELS, type Service, type Location, type User, type GroupSession, type GroupSessionLevel } from '@/types'

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
type Scope = 'single' | 'following' | 'all'
type RecurrenceVal = 'none' | 'weekly' | 'biweekly' | 'monthly'
type RecurrenceEndType = 'infinite' | '3months' | '6months' | '1year' | 'count'

export default function EditGroupSessionPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const groupSessionId = params.id
  const { user } = useAuth()
  const isAdmin = user?.roles?.includes('admin') ?? false

  const [groupSession, setGroupSession] = useState<GroupSession | null>(null)
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [coachIds, setCoachIds] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [maxParticipants, setMaxParticipants] = useState(8)
  const [price, setPrice] = useState(0)
  const [level, setLevel] = useState<GroupSessionLevel | ''>('')

  const [recurrence, setRecurrence] = useState<RecurrenceVal>('none')
  const [recurrenceEndType, setRecurrenceEndType] = useState<RecurrenceEndType>('3months')
  const [recurrenceCount, setRecurrenceCount] = useState(12)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showScopeModal, setShowScopeModal] = useState(false)

  const { data: allServices } = useCollection<Service>('services', [orderBy('name')])
  const { data: allLocations } = useCollection<Location>('locations', [orderBy('name')])
  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])

  const services = useMemo(() => allServices.filter(s => {
    if (s.active === false) return false
    if (!s.assignedCoachIds || s.assignedCoachIds.length === 0) return true
    if (isAdmin) return true
    return user?.id ? s.assignedCoachIds.includes(user.id) : false
  }), [allServices, isAdmin, user?.id])
  const locations = useMemo(() => allLocations.filter(l => l.active !== false), [allLocations])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  useEffect(() => {
    getDoc(doc(db, 'groupSessions', groupSessionId)).then(snap => {
      if (!snap.exists()) { setLoading(false); return }
      const gs = { id: snap.id, ...snap.data() } as GroupSession
      setGroupSession(gs)
      const start = gs.startAt.toDate()
      const end = gs.endAt.toDate()
      const mins = Math.round((end.getTime() - start.getTime()) / 60000)
      setTitle(gs.title)
      setDescription(gs.description ?? '')
      setServiceId(gs.serviceId ?? '')
      setLocationId(gs.locationId)
      setCoachIds(gs.coachIds)
      setDate(format(start, 'yyyy-MM-dd'))
      setStartTime(format(start, 'HH:mm'))
      setDuration(DURATIONS.includes(mins as typeof DURATIONS[number]) ? mins : 60)
      setMaxParticipants(gs.maxParticipants)
      setPrice(gs.price)
      setLevel(gs.level ?? '')
      setLoading(false)
    })
  }, [groupSessionId])

  const selectedService = useMemo(() => services.find(s => s.id === serviceId), [services, serviceId])
  const alreadyRecurring = !!groupSession?.recurrenceId
  const coachNames = useMemo(
    () => coachIds.map(cId => coaches.find(c => c.id === cId)?.firstName).filter((n): n is string => !!n),
    [coachIds, coaches]
  )

  const canSubmit = !!(serviceId && title.trim() && locationId && coachIds.length > 0 && date && startTime && maxParticipants > 0)

  function handleServiceSelect(s: Service) {
    setServiceId(s.id)
    setTitle(s.name)
    setPrice(s.price)
  }

  const buildStartEnd = useCallback((): [Date, Date] => {
    const [yr, mo, dy] = date.split('-').map(Number)
    const [hh, mm] = startTime.split(':').map(Number)
    const startDate = new Date(yr!, mo! - 1, dy!, hh!, mm!, 0)
    return [startDate, addMinutes(startDate, duration)]
  }, [date, startTime, duration])

  const doSaveSingle = useCallback(async () => {
    if (!selectedService) return
    const [startDate, endDate] = buildStartEnd()
    await updateDoc(doc(db, 'groupSessions', groupSessionId), {
      serviceId, title: title.trim(), description: description.trim(),
      coachIds, coachNames, locationId, maxParticipants, price,
      level: level || deleteField(),
      dayOfWeek: startDate.getDay(), startTime,
      startAt: Timestamp.fromDate(startDate),
      endAt: Timestamp.fromDate(endDate),
      updatedAt: serverTimestamp(),
    })
    logActivity({
      userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName,
      action: 'session_edited', description: `Séance collective "${title.trim()}"`, sessionId: groupSessionId,
    })
  }, [selectedService, buildStartEnd, groupSessionId, serviceId, title, description, coachIds, coachNames, locationId, maxParticipants, price, level, startTime, user])

  const doSaveWithNewRecurrence = useCallback(async () => {
    if (!selectedService || recurrence === 'none') return
    const [startDate] = buildStartEnd()

    const isInfinite = recurrenceEndType === 'infinite'
    const endCondition: { type: 'months'; count: number } | { type: 'count'; count: number } =
      recurrenceEndType === 'count'
        ? { type: 'count', count: recurrenceCount }
        : { type: 'months', count: recurrenceEndType === '3months' ? 3 : recurrenceEndType === '6months' ? 6 : 12 }
    const generationEnd = isInfinite ? { type: 'months' as const, count: 3 } : endCondition
    const occurrences = generateOccurrenceDates(startDate, recurrence, generationEnd)

    const recurrenceRef = await addDoc(collection(db, 'groupSessionRecurrences'), {
      serviceId, title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      coachIds, coachNames, locationId, maxParticipants, price,
      ...(level ? { level } : {}),
      isPublic: true,
      createdBy: user!.id,
      rule: {
        frequency: recurrence, dayOfWeek: startDate.getDay(), startTime, duration,
        startDate: Timestamp.fromDate(startDate), infinite: isInfinite,
        ...(!isInfinite && endCondition.type === 'months'
          ? { endDate: Timestamp.fromDate(new Date(startDate.getFullYear(), startDate.getMonth() + endCondition.count, startDate.getDate())) }
          : {}),
        ...(!isInfinite && endCondition.type === 'count' ? { count: endCondition.count } : {}),
      },
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })

    // Cette séance devient la première occurrence de la nouvelle série
    await updateDoc(doc(db, 'groupSessions', groupSessionId), {
      serviceId, title: title.trim(), description: description.trim(),
      coachIds, coachNames, locationId, maxParticipants, price,
      level: level || deleteField(),
      dayOfWeek: startDate.getDay(), startTime,
      startAt: Timestamp.fromDate(startDate),
      endAt: Timestamp.fromDate(addMinutes(startDate, duration)),
      recurrenceId: recurrenceRef.id,
      updatedAt: serverTimestamp(),
    })

    const batch = writeBatch(db)
    for (const occDate of occurrences.slice(1)) {
      const gsRef = doc(collection(db, 'groupSessions'))
      batch.set(gsRef, {
        serviceId, title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        coachIds, coachNames, locationId, maxParticipants, price,
        ...(level ? { level } : {}),
        dayOfWeek: occDate.getDay(), startTime,
        status: 'planned', isPublic: true,
        enrollments: [], recurrenceId: recurrenceRef.id, createdBy: user!.id,
        startAt: Timestamp.fromDate(occDate),
        endAt: Timestamp.fromDate(addMinutes(occDate, duration)),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()

    logActivity({
      userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName,
      action: 'session_edited',
      description: `Séance collective "${title.trim()}" · rendue récurrente (${occurrences.length} séances)`,
      sessionId: groupSessionId,
    })
  }, [selectedService, recurrence, buildStartEnd, recurrenceEndType, recurrenceCount, serviceId, title, description, coachIds, coachNames, locationId, maxParticipants, price, level, user, startTime, duration, groupSessionId])

  const doSaveScoped = useCallback(async (scope: Scope) => {
    if (!selectedService || !groupSession) return
    const [startDate, endDate] = buildStartEnd()
    const [hh, mm] = startTime.split(':').map(Number)

    if (scope === 'single') {
      await updateDoc(doc(db, 'groupSessions', groupSessionId), {
        serviceId, title: title.trim(), description: description.trim(),
        coachIds, coachNames, locationId, maxParticipants, price,
        level: level || deleteField(),
        dayOfWeek: startDate.getDay(), startTime,
        startAt: Timestamp.fromDate(startDate),
        endAt: Timestamp.fromDate(endDate),
        updatedAt: serverTimestamp(),
      })
    } else {
      const q = query(collection(db, 'groupSessions'), where('recurrenceId', '==', groupSession.recurrenceId))
      const snap = await getDocs(q)
      const batch = writeBatch(db)

      snap.docs.filter(d => {
        const gs = d.data() as GroupSession
        if (gs.status !== 'planned') return false
        if (scope === 'following') return gs.startAt.seconds >= groupSession.startAt.seconds
        return true
      }).forEach(d => {
        const gs = d.data() as GroupSession
        const origStart = gs.startAt.toDate()
        const newStart = new Date(origStart.getFullYear(), origStart.getMonth(), origStart.getDate(), hh!, mm!, 0)
        const newEnd = addMinutes(newStart, duration)
        batch.update(doc(db, 'groupSessions', d.id), {
          serviceId, title: title.trim(), description: description.trim(),
          coachIds, coachNames, locationId, maxParticipants, price,
          level: level || deleteField(),
          dayOfWeek: newStart.getDay(), startTime,
          startAt: Timestamp.fromDate(newStart),
          endAt: Timestamp.fromDate(newEnd),
          updatedAt: serverTimestamp(),
        })
      })

      await batch.commit()
    }

    const scopeLabel = scope === 'single' ? 'cette séance' : scope === 'following' ? 'cette séance et les suivantes' : 'toutes les séances'
    logActivity({
      userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName,
      action: 'session_edited', description: `Séance collective "${title.trim()}" · ${scopeLabel}`, sessionId: groupSessionId,
    })
  }, [selectedService, groupSession, buildStartEnd, startTime, groupSessionId, serviceId, title, description, coachIds, coachNames, locationId, maxParticipants, price, level, duration, user])

  async function handleSave(scope?: Scope) {
    if (!canSubmit || saving) return
    setSaving(true)
    setError('')
    setShowScopeModal(false)
    try {
      if (scope) {
        await doSaveScoped(scope)
      } else if (alreadyRecurring) {
        setShowScopeModal(true)
        setSaving(false)
        return
      } else if (recurrence !== 'none') {
        await doSaveWithNewRecurrence()
      } else {
        await doSaveSingle()
      }
      router.back()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Chargement…</div>
  if (!groupSession) return <div className="flex items-center justify-center h-screen text-sm text-text-secondary">Séance introuvable</div>

  return (
    <>
      <TopBar
        title="Modifier la séance publique"
        left={<button onClick={() => router.back()} className="p-2 -ml-1 text-text-secondary">Annuler</button>}
        right={
          <button
            onClick={() => handleSave()}
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
        {serviceId && !selectedService && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FFF4E5', color: '#B26A00', fontSize: 13 }}>
            Le service d&apos;origine de cette séance n&apos;est plus disponible (supprimé ou désactivé) — choisis un service actif ci-dessous pour pouvoir enregistrer.
          </div>
        )}
        {alreadyRecurring && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F0EDE8', color: '#7A7570', fontSize: 13 }}>
            Cette séance fait partie d&apos;une série récurrente — tu choisiras à l&apos;enregistrement si le changement s&apos;applique à cette séance uniquement, aux suivantes, ou à toute la série.
          </div>
        )}

        {/* Informations */}
        <Section title="Informations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input style={inputStyle} placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea
              style={{ ...inputStyle, height: 64, padding: '8px 10px', resize: 'none' }}
              placeholder="Description (optionnel)"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </Section>

        {/* Service */}
        <Section title="Service">
          {services.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun service actif</p>}
          {services.map(s => (
            <SelectItem
              key={s.id}
              label={s.name}
              sub={s.isPublic ? `${s.price.toFixed(2)} CHF · Public` : `${s.price.toFixed(2)} CHF`}
              selected={serviceId === s.id}
              onSelect={() => handleServiceSelect(s)}
            />
          ))}
        </Section>

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

        {/* Lieu */}
        <Section title="Lieu">
          {locations.length === 0 && <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun lieu actif</p>}
          {locations.map(l => (
            <SelectItem key={l.id} label={l.name} sub={l.address} selected={locationId === l.id} onSelect={() => setLocationId(l.id)} />
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

        {/* Places & prix */}
        <Section title="Places & prix">
          <Row label="Nombre max de places">
            <input
              type="number" min={1} style={{ ...inputStyle, width: 90 }}
              value={maxParticipants}
              onChange={e => setMaxParticipants(Math.max(1, Number(e.target.value)))}
            />
          </Row>
          <Row label="Prix par personne (CHF)">
            <input
              type="number" min={0} step={5} style={{ ...inputStyle, width: 90 }}
              value={price}
              onChange={e => setPrice(Math.max(0, Number(e.target.value)))}
            />
          </Row>
        </Section>
        <p style={{ fontSize: 11, color: '#A09890', margin: 0 }}>
          Les inscriptions déjà payées ne sont pas recalculées — un changement de prix ne s&apos;applique qu&apos;aux nouvelles inscriptions.
        </p>

        {/* Niveau — optionnel */}
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

        {/* Récurrence — seulement si cette séance n'en fait pas déjà partie */}
        {!alreadyRecurring && (
          <Section title="Récurrence">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: recurrence !== 'none' ? 10 : 0 }}>
              {([['none', 'Aucune'], ['weekly', 'Hebdo'], ['biweekly', 'Bi-hebdo'], ['monthly', 'Mensuel']] as [RecurrenceVal, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setRecurrence(val)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: recurrence === val ? '#1A1A18' : '#F0EDE8', color: recurrence === val ? '#fff' : '#1A1A18' }}>
                  {label}
                </button>
              ))}
            </div>
            {recurrence !== 'none' && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {([['infinite', 'Sans fin'], ['3months', '3 mois'], ['6months', '6 mois'], ['1year', '1 an'], ['count', 'Nb séances']] as [RecurrenceEndType, string][]).map(([val, label]) => (
                    <button key={val} onClick={() => setRecurrenceEndType(val)} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, backgroundColor: recurrenceEndType === val ? '#1A1A18' : '#F0EDE8', color: recurrenceEndType === val ? '#fff' : '#1A1A18' }}>
                      {label}
                    </button>
                  ))}
                </div>
                {recurrenceEndType === 'count' && (
                  <Row label="Nombre de séances">
                    <input
                      type="number" min={2} max={200} style={{ ...inputStyle, width: 70 }}
                      value={recurrenceCount}
                      onChange={e => setRecurrenceCount(Math.max(2, Math.min(200, parseInt(e.target.value) || 2)))}
                    />
                  </Row>
                )}
                <p style={{ fontSize: 12, color: '#7A7570', display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 0' }}>
                  <RefreshCw size={12} />
                  Cette séance devient la première d&apos;une nouvelle série {recurrenceEndType === 'infinite' ? '(prolongée automatiquement)' : ''}
                </p>
              </>
            )}
          </Section>
        )}
      </div>

      {/* Modal choix de portée pour séances déjà récurrentes */}
      {showScopeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowScopeModal(false)}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px', width: '100%', maxWidth: 480 }}
            onClick={e => e.stopPropagation()}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1A1A18', marginBottom: 4 }}>Modifier la série récurrente</p>
            <p style={{ fontSize: 13, color: '#7A7570', marginBottom: 16 }}>Quelle séance souhaites-tu modifier ?</p>
            {([
              ['single', 'Cette séance uniquement'],
              ['following', 'Cette séance et les suivantes'],
              ['all', 'Toutes les séances'],
            ] as [Scope, string][]).map(([scope, label]) => (
              <button key={scope} onClick={() => handleSave(scope)}
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
