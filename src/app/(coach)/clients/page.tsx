'use client'

import { useState, useMemo, useEffect } from 'react'
import { orderBy, increment, serverTimestamp, doc, collection, addDoc, getDocs, query, where, orderBy as fbOrderBy, limit, startAfter, deleteDoc, type QueryDocumentSnapshot } from 'firebase/firestore'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { db } from '@/lib/firebase/firestore'
import { useCollection } from '@/lib/hooks/useCollection'
import { createDoc, updateDocById } from '@/lib/services/crud.service'
import { logActivity } from '@/lib/services/activity.service'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FormField } from '@/components/ui/form-field'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useAuth } from '@/lib/hooks/useAuth'
import { Plus, Search, Users, Pencil, CreditCard, X, Trash2, Check, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { Client, CreditTransaction, User as UserType } from '@/types'

export default function ClientsPage() {
  const router = useRouter()
  const { isAdmin, user } = useAuth()
  const { data: clients, loading } = useCollection<Client>('clients', [orderBy('lastName')])
  const { data: coaches } = useCollection<UserType>('users', [orderBy('firstName')])
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Client | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Gestion crédits
  const [creditClient, setCreditClient] = useState<Client | null>(null)
  const [creditAmount, setCreditAmount] = useState('1')
  const [creditNote, setCreditNote] = useState('')
  const [creditSaving, setCreditSaving] = useState(false)
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[]>([])
  const [creditHistoryLoading, setCreditHistoryLoading] = useState(false)
  const [creditHistoryLastDoc, setCreditHistoryLastDoc] = useState<QueryDocumentSnapshot | null>(null)
  const [creditHistoryHasMore, setCreditHistoryHasMore] = useState(false)
  const HISTORY_PAGE = 8

  useEffect(() => {
    if (!creditClient) { setCreditHistory([]); setCreditHistoryLastDoc(null); return }
    setCreditHistoryLoading(true)
    getDocs(
      query(
        collection(db, 'creditTransactions'),
        where('clientId', '==', creditClient.id),
        fbOrderBy('createdAt', 'desc'),
        limit(HISTORY_PAGE)
      )
    ).then(snap => {
      setCreditHistory(snap.docs.map(d => ({ id: d.id, ...d.data() }) as CreditTransaction))
      setCreditHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null)
      setCreditHistoryHasMore(snap.docs.length === HISTORY_PAGE)
    }).finally(() => setCreditHistoryLoading(false))
  }, [creditClient])

  async function loadMoreHistory() {
    if (!creditClient || !creditHistoryLastDoc) return
    setCreditHistoryLoading(true)
    const snap = await getDocs(
      query(
        collection(db, 'creditTransactions'),
        where('clientId', '==', creditClient.id),
        fbOrderBy('createdAt', 'desc'),
        startAfter(creditHistoryLastDoc),
        limit(HISTORY_PAGE)
      )
    )
    setCreditHistory(prev => [...prev, ...snap.docs.map(d => ({ id: d.id, ...d.data() }) as CreditTransaction)])
    setCreditHistoryLastDoc(snap.docs[snap.docs.length - 1] ?? null)
    setCreditHistoryHasMore(snap.docs.length === HISTORY_PAGE)
    setCreditHistoryLoading(false)
  }

  // Champs formulaire
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [visibleCoachIds, setVisibleCoachIds] = useState<string[]>([])

  const filtered = useMemo(() => {
    let result = clients
    if (!isAdmin && user?.id) {
      result = result.filter(c => c.visibleToCoachIds.length === 0 || c.visibleToCoachIds.includes(user.id))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.includes(q)
      )
    }
    return result
  }, [clients, search, isAdmin, user])

  function openCreate() {
    setEditing(null); setFirstName(''); setLastName(''); setEmail(''); setPhone('')
    setAddress(''); setCity(''); setPostalCode(''); setAdditionalInfo('')
    // Pré-assigner le coach connecté (sauf admin qui voit tout)
    setVisibleCoachIds(isAdmin ? [] : (user?.id ? [user.id] : []))
    setError(null); setSheet('create')
  }

  function openEdit(c: Client) {
    setEditing(c); setFirstName(c.firstName); setLastName(c.lastName); setEmail(c.email ?? '')
    setPhone(c.phone ?? ''); setAddress(c.address ?? ''); setCity(c.city ?? '')
    setPostalCode(c.postalCode ?? ''); setAdditionalInfo(c.additionalInfo ?? ''); setVisibleCoachIds(c.visibleToCoachIds ?? []); setError(null); setSheet('edit')
  }

  function close() { setSheet(null); setEditing(null); setConfirmDelete(false) }

  async function handleDelete() {
    if (!editing) return
    setDeleting(true)
    try {
      await deleteDoc(doc(db, 'clients', editing.id))
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'client_deleted', description: `${editing.firstName} ${editing.lastName}`, clientId: editing.id })
      close()
    } finally {
      setDeleting(false)
    }
  }

  function openCredits(e: React.MouseEvent, c: Client) {
    e.stopPropagation()
    setCreditClient(c)
    setCreditAmount('1')
    setCreditNote('')
  }

  async function handleAddCredits() {
    if (!creditClient) return
    const qty = parseInt(creditAmount)
    if (isNaN(qty) || qty === 0) return
    setCreditSaving(true)
    try {
      await updateDocById('clients', creditClient.id, { sessionCredits: increment(qty) })
      await addDoc(collection(db, 'creditTransactions'), {
        clientId: creditClient.id,
        type: qty > 0 ? 'add' : 'correction',
        quantity: Math.abs(qty),
        note: creditNote.trim(),
        createdBy: user?.id ?? '',
        createdAt: serverTimestamp(),
      })
      const sign = qty > 0 ? '+' : ''
      const desc = `${creditClient.firstName} ${creditClient.lastName} · ${sign}${qty} crédit${Math.abs(qty) > 1 ? 's' : ''}${creditNote.trim() ? ` · ${creditNote.trim()}` : ''}`
      logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'credit_added', description: desc, clientId: creditClient.id })
      setCreditClient(null)
    } catch {
      // ignore
    } finally {
      setCreditSaving(false)
    }
  }

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) { setError('Prénom et nom sont requis.'); return }
    setSaving(true); setError(null)
    try {
      const data = {
        firstName: firstName.trim(), lastName: lastName.trim(),
        email, phone, address, city, postalCode, additionalInfo,
        visibleToCoachIds: visibleCoachIds,
      }
      if (sheet === 'create') {
        const newId = await createDoc('clients', { ...data, sessionCredits: 0 })
        logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'client_created', description: `${data.firstName} ${data.lastName}`, clientId: newId })
      } else if (editing) {
        await updateDocById('clients', editing.id, data)
        logActivity({ userId: user!.id, userFirstName: user!.firstName, userLastName: user!.lastName, action: 'client_edited', description: `${data.firstName} ${data.lastName}`, clientId: editing.id })
      }
      close()
    } catch (err) { setError((err as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <>
      <TopBar
        title="Clients"
        right={<Button size="icon-sm" onClick={openCreate}><Plus size={18} /></Button>}
      />
      <TopBarSpacer />

      {/* Barre de recherche */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#7A7570' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            className="w-full h-10 pl-9 pr-9 text-[14px] rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] outline-none focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={14} style={{ color: '#7A7570' }} />
            </button>
          )}
        </div>
      </div>

      {loading ? <ListSkeleton /> : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? 'Aucun résultat' : 'Aucun client'}
          description={search ? `Aucun client pour "${search}"` : 'Ajoute ton premier client.'}
          action={!search ? <Button onClick={openCreate}><Plus size={16} />Ajouter un client</Button> : undefined}
        />
      ) : (
        <div className="px-4 pb-4 space-y-2">
          <p className="section-label py-2">{filtered.length} client{filtered.length > 1 ? 's' : ''}</p>
          {filtered.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] press-effect"
              onClick={() => router.push(`/clients/${c.id}` as never)}
            >
              {/* Avatar initiales */}
              <div className="w-10 h-10 rounded-full bg-[#F0EDE8] border border-[var(--color-border)] flex items-center justify-center shrink-0 text-[13px] font-semibold text-[#7A7570]">
                {c.firstName[0]}{c.lastName[0]}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
                  {c.firstName} {c.lastName}
                </p>
                {c.phone && <p className="text-[12px] text-[var(--color-text-tertiary)]">{c.phone}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => openCredits(e, c)}
                  className="flex items-center gap-1 px-2 py-1 rounded-[var(--radius-badge)]"
                  style={{ background: c.sessionCredits > 0 ? '#E8F3EE' : '#F0EDE8', border: 'none', cursor: 'pointer' }}
                >
                  <CreditCard size={12} style={{ color: c.sessionCredits > 0 ? '#2D7A4F' : '#7A7570' }} />
                  <span className="text-[12px] font-medium" style={{ color: c.sessionCredits > 0 ? '#2D7A4F' : '#7A7570' }}>
                    {c.sessionCredits}
                  </span>
                </button>
                <button onClick={e => { e.stopPropagation(); openEdit(c) }} style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Pencil size={14} style={{ color: '#C8C4BC' }} />
                </button>
                <ChevronRight size={14} style={{ color: '#C8C4BC' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sheet gestion crédits */}
      {creditClient && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreditClient(null)} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-[17px] font-semibold">Crédits — {creditClient.firstName} {creditClient.lastName}</h2>
                <p className="text-[13px] text-[var(--color-text-tertiary)] mt-0.5">
                  Solde actuel : <strong>{creditClient.sessionCredits}</strong> crédit{creditClient.sessionCredits > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={() => setCreditClient(null)} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <FormField label="Ajustement" hint="Positif pour ajouter, négatif pour retirer">
              <Input
                type="number"
                value={creditAmount}
                onChange={e => setCreditAmount(e.target.value)}
                placeholder="ex. 5 ou -1"
              />
            </FormField>
            <FormField label="Note (optionnel)">
              <Input
                value={creditNote}
                onChange={e => setCreditNote(e.target.value)}
                placeholder="Pack 10 séances, correction..."
              />
            </FormField>

            <Button size="lg" className="w-full" onClick={handleAddCredits} loading={creditSaving}>
              Confirmer
            </Button>

            {/* Historique */}
            <div className="pt-2">
              <p className="section-label mb-2">Historique</p>
              {creditHistoryLoading ? (
                <p className="text-[13px] text-[var(--color-text-tertiary)]">Chargement…</p>
              ) : creditHistory.length === 0 ? (
                <p className="text-[13px] text-[var(--color-text-tertiary)]">Aucune transaction.</p>
              ) : (
                <div className="space-y-1">
                  {creditHistory.map(tx => {
                    const date = tx.createdAt?.toDate ? format(tx.createdAt.toDate(), 'd MMM yyyy', { locale: fr }) : '—'
                    const isUse = tx.type === 'use'
                    return (
                      <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[var(--color-text-primary)]">
                            {isUse ? 'Séance déduite' : tx.type === 'add' ? 'Crédits ajoutés' : 'Correction'}
                            {tx.note ? <span className="text-[var(--color-text-tertiary)]"> · {tx.note}</span> : null}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-tertiary)]">{date}</p>
                        </div>
                        <span className="text-[13px] font-semibold ml-3 shrink-0" style={{ color: isUse ? '#C0392B' : '#2D7A4F' }}>
                          {isUse ? '−' : '+'}{tx.quantity}
                        </span>
                      </div>
                    )
                  })}
                  {creditHistoryHasMore && (
                    <button
                      onClick={loadMoreHistory}
                      disabled={creditHistoryLoading}
                      className="w-full pt-2 text-[13px] text-[var(--color-text-tertiary)] text-center"
                    >
                      {creditHistoryLoading ? 'Chargement…' : 'Voir plus'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet création/édition */}
      {sheet && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={close} />
          <div className="relative bg-[var(--color-surface)] rounded-t-[20px] p-6 space-y-4 max-h-[90dvh] overflow-y-auto" style={{ boxShadow: 'var(--shadow-sheet)' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[17px] font-semibold">{sheet === 'create' ? 'Nouveau client' : 'Modifier le client'}</h2>
              <button onClick={close} className="text-[13px] text-[var(--color-text-tertiary)]">Annuler</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Prénom" required>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Prénom" />
              </FormField>
              <FormField label="Nom" required>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nom" />
              </FormField>
            </div>
            <FormField label="Téléphone">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+41 76 000 00 00" />
            </FormField>
            <FormField label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <FormField label="Adresse">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rue" />
                </FormField>
              </div>
              <FormField label="NPA">
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="1200" />
              </FormField>
            </div>
            <FormField label="Ville">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Genève" />
            </FormField>
            <FormField label="Notes" hint="Visible par les coachs assignés à ce client">
              <Textarea value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} placeholder="Blessures, préférences, objectifs..." />
            </FormField>

            <div>
              <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                Coachs assignés <span className="normal-case font-normal">(vide = tous les coachs)</span>
              </p>
              <div className="space-y-0.5">
                {coaches.map(c => {
                  const sel = visibleCoachIds.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => setVisibleCoachIds(sel ? visibleCoachIds.filter(id => id !== c.id) : [...visibleCoachIds, c.id])}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', backgroundColor: sel ? '#F0EDE8' : 'transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: '#fff', flexShrink: 0 }}>
                          {c.firstName[0]}{c.lastName[0]}
                        </div>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: sel ? 500 : 400, margin: 0 }}>{c.firstName} {c.lastName}</p>
                      </div>
                      {sel && <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={11} color="#fff" /></div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && <p className="text-[13px] text-[var(--color-danger)]">{error}</p>}
            <Button size="lg" className="w-full" onClick={handleSave} loading={saving}>
              {sheet === 'create' ? 'Créer le client' : 'Enregistrer'}
            </Button>

            {sheet === 'edit' && isAdmin && (
              confirmDelete ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[13px] text-center text-[var(--color-text-tertiary)]">Supprimer définitivement ce client ?</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                    <Button size="lg" className="flex-1" onClick={handleDelete} loading={deleting}
                      style={{ background: '#C0392B', color: '#fff', borderColor: '#C0392B' }}>
                      Confirmer
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-[13px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 size={14} />
                  Supprimer ce client
                </button>
              )
            )}
          </div>
        </div>
      )}
    </>
  )
}
