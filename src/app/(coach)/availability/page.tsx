'use client'

import { useState, useMemo, useCallback } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { orderBy, where, Timestamp } from 'firebase/firestore'
import { Plus, Trash2, X, Check, RefreshCw, Calendar } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useCollection } from '@/lib/hooks/useCollection'
import { useAuth } from '@/lib/hooks/useAuth'
import { createDoc, deleteDocById, updateDocById } from '@/lib/services/crud.service'
import type { User, AvailabilitySlot, RecurringAvailability, DayOfWeek } from '@/types'

// ─── Constantes ──────────────────────────────────────────────────────────────

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: 1, label: 'Lundi',    short: 'Lun' },
  { value: 2, label: 'Mardi',    short: 'Mar' },
  { value: 3, label: 'Mercredi', short: 'Mer' },
  { value: 4, label: 'Jeudi',    short: 'Jeu' },
  { value: 5, label: 'Vendredi', short: 'Ven' },
  { value: 6, label: 'Samedi',   short: 'Sam' },
  { value: 0, label: 'Dimanche', short: 'Dim' },
]

const inputStyle: React.CSSProperties = {
  height: 36, border: '1px solid #E5E1DA', borderRadius: 8,
  padding: '0 10px', fontSize: 14, color: '#1A1A18',
  background: '#F9F8F6', outline: 'none',
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
      {children}
    </p>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', backgroundColor: value ? '#1A1A18' : '#E5E1DA', position: 'relative', transition: 'background 200ms', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 200ms' }} />
    </button>
  )
}

// ─── Sheet ajout ponctuel ────────────────────────────────────────────────────

function AddOnceSheet({ coachId, onClose }: { coachId: string; onClose: () => void }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!date || !startTime || !endTime) return
    setSaving(true)
    const [yr, mo, dy] = date.split('-').map(Number)
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    await createDoc('availabilitySlots', {
      coachId,
      startAt: Timestamp.fromDate(new Date(yr!, mo! - 1, dy!, sh, sm, 0)),
      endAt: Timestamp.fromDate(new Date(yr!, mo! - 1, dy!, eh, em, 0)),
    } as Record<string, unknown>)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Créneau ponctuel</p>
          <button onClick={onClose} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570' }}><X size={20} /></button>
        </div>
        <div>
          <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>Date</p>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>De</p>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>À</p>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ width: '100%', height: 48, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#1A1A18', color: '#fff', fontSize: 15, fontWeight: 600 }}>
          {saving ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </div>
    </div>
  )
}

// ─── Sheet ajout récurrent ───────────────────────────────────────────────────

function AddRecurringSheet({ coachId, onClose }: { coachId: string; onClose: () => void }) {
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(1)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await createDoc('recurringAvailabilities', { coachId, dayOfWeek, startTime, endTime, active: true } as Record<string, unknown>)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Disponibilité hebdomadaire</p>
          <button onClick={onClose} style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570' }}><X size={20} /></button>
        </div>
        <div>
          <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 8px' }}>Jour</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DAYS.map(d => (
              <button key={d.value} onClick={() => setDayOfWeek(d.value)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, backgroundColor: dayOfWeek === d.value ? '#1A1A18' : '#F0EDE8', color: dayOfWeek === d.value ? '#fff' : '#1A1A18' }}>
                {d.short}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>De</p>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>À</p>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ width: '100%', height: 48, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#1A1A18', color: '#fff', fontSize: 15, fontWeight: 600 }}>
          {saving ? 'Enregistrement…' : 'Ajouter'}
        </button>
      </div>
    </div>
  )
}

// ─── Choix du type d'ajout ───────────────────────────────────────────────────

function AddChoiceSheet({ onChoose, onClose }: { onChoose: (type: 'once' | 'recurring') => void; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'relative', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#1A1A18', margin: '0 0 4px' }}>Ajouter une disponibilité</p>
        <button
          onClick={() => onChoose('recurring')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', borderRadius: 10, border: '1px solid #E5E1DA', cursor: 'pointer', background: '#fff', textAlign: 'left' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <RefreshCw size={16} color="#1A1A18" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A18', margin: 0 }}>Hebdomadaire</p>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '1px 0 0' }}>Se répète chaque semaine</p>
          </div>
        </button>
        <button
          onClick={() => onChoose('once')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 12px', borderRadius: 10, border: '1px solid #E5E1DA', cursor: 'pointer', background: '#fff', textAlign: 'left' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Calendar size={16} color="#1A1A18" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: '#1A1A18', margin: 0 }}>Ponctuel</p>
            <p style={{ fontSize: 12, color: '#7A7570', margin: '1px 0 0' }}>Un créneau spécifique</p>
          </div>
        </button>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const { user, isAdmin } = useAuth()
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'none' | 'choice' | 'once' | 'recurring'>('none')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: allCoaches } = useCollection<User>('users', [orderBy('firstName')])
  const coaches = useMemo(() => allCoaches.filter(c => c.active !== false), [allCoaches])

  const activeCoachId = isAdmin ? (selectedCoachId ?? user?.id ?? '') : (user?.id ?? '')

  const slotsConstraints = useMemo(() =>
    activeCoachId ? [where('coachId', '==', activeCoachId), orderBy('startAt')] : [],
    [activeCoachId]
  )
  const recurringConstraints = useMemo(() =>
    activeCoachId ? [where('coachId', '==', activeCoachId), orderBy('dayOfWeek')] : [],
    [activeCoachId]
  )

  const { data: slots } = useCollection<AvailabilitySlot>('availabilitySlots', slotsConstraints)
  const { data: recurring } = useCollection<RecurringAvailability>('recurringAvailabilities', recurringConstraints)

  // Ne montrer que les créneaux ponctuels à venir
  const upcomingSlots = useMemo(() => {
    const now = Date.now()
    return slots.filter(s => s.endAt.toMillis() > now)
  }, [slots])

  const handleDeleteSlot = useCallback(async (id: string) => {
    setDeletingId(id)
    await deleteDocById('availabilitySlots', id)
    setDeletingId(null)
  }, [])

  const handleDeleteRecurring = useCallback(async (id: string) => {
    setDeletingId(id)
    await deleteDocById('recurringAvailabilities', id)
    setDeletingId(null)
  }, [])

  const handleToggleActive = useCallback(async (item: RecurringAvailability) => {
    await updateDocById('recurringAvailabilities', item.id, { active: !item.active })
  }, [])

  const dayLabel = (d: DayOfWeek) => DAYS.find(x => x.value === d)?.label ?? ''

  return (
    <>
      <TopBar title="Disponibilités" />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {/* Sélecteur de coach (admin) */}
        {isAdmin && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
            <SectionLabel>Coach</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {coaches.map(c => (
                <button key={c.id} onClick={() => setSelectedCoachId(c.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: activeCoachId === c.id ? '#F0EDE8' : 'transparent', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.color ?? '#A09890', flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: '#1A1A18', fontWeight: activeCoachId === c.id ? 500 : 400 }}>{c.firstName} {c.lastName}</span>
                  </div>
                  {activeCoachId === c.id && <Check size={14} color="#1A1A18" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeCoachId && (
          <>
            {/* ── Hebdomadaires ─────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <RefreshCw size={12} color="#A09890" />
                <SectionLabel>Chaque semaine</SectionLabel>
              </div>

              {recurring.length === 0 ? (
                <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucune disponibilité hebdomadaire</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {recurring.map((item, i) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', gap: 8, borderBottom: i < recurring.length - 1 ? '1px solid #F0EDE8' : 'none', opacity: item.active ? 1 : 0.45 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>{dayLabel(item.dayOfWeek)}</p>
                        <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0' }}>{item.startTime} → {item.endTime}</p>
                      </div>
                      <Toggle value={item.active} onChange={() => handleToggleActive(item)} />
                      <button onClick={() => handleDeleteRecurring(item.id)} disabled={deletingId === item.id} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', opacity: deletingId === item.id ? 0.4 : 1, flexShrink: 0 }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Ponctuels à venir ─────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Calendar size={12} color="#A09890" />
                <SectionLabel>Créneaux ponctuels à venir</SectionLabel>
              </div>

              {upcomingSlots.length === 0 ? (
                <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: '8px 0' }}>Aucun créneau ponctuel</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {upcomingSlots.map((slot, i) => {
                    const start = slot.startAt.toDate()
                    const end = slot.endAt.toDate()
                    return (
                      <div key={slot.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', gap: 8, borderBottom: i < upcomingSlots.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0, textTransform: 'capitalize' }}>
                            {format(start, 'EEEE d MMM yyyy', { locale: fr })}
                          </p>
                          <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0' }}>
                            {format(start, 'HH:mm')} → {format(end, 'HH:mm')}
                          </p>
                        </div>
                        <button onClick={() => handleDeleteSlot(slot.id)} disabled={deletingId === slot.id} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', opacity: deletingId === slot.id ? 0.4 : 1, flexShrink: 0 }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Bouton + */}
      {activeCoachId && (
        <button
          onClick={() => setSheet('choice')}
          style={{ position: 'fixed', bottom: 'calc(var(--bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px) + 16px)', right: 16, width: 52, height: 52, borderRadius: '50%', border: 'none', backgroundColor: '#1A1A18', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 60, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <Plus size={22} />
        </button>
      )}

      {sheet === 'choice' && (
        <AddChoiceSheet
          onChoose={type => setSheet(type)}
          onClose={() => setSheet('none')}
        />
      )}
      {sheet === 'once' && activeCoachId && (
        <AddOnceSheet coachId={activeCoachId} onClose={() => setSheet('none')} />
      )}
      {sheet === 'recurring' && activeCoachId && (
        <AddRecurringSheet coachId={activeCoachId} onClose={() => setSheet('none')} />
      )}
    </>
  )
}
