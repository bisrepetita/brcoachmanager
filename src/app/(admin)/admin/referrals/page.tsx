'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowLeft, Gift } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSkeleton } from '@/components/shared/LoadingSkeleton'
import { useAuth } from '@/lib/hooks/useAuth'
import { logActivity } from '@/lib/services/activity.service'
import {
  findFirstPaidPurchase, findReferredClients, referralStatus, setReferralRewarded,
  REFERRAL_STATUS_LABELS, type FirstPaidPurchase, type ReferralStatus,
} from '@/lib/services/referral.service'
import type { Client } from '@/types'

interface ReferralRow { filleul: Client; firstPaid: FirstPaidPurchase | null; status: ReferralStatus }

const STATUS_BADGE: Record<ReferralStatus, 'muted' | 'credits' | 'gold' | 'paid'> = {
  signed_up: 'muted',
  free_session_used: 'credits',
  to_reward: 'gold',
  rewarded: 'paid',
}

const STATUS_ORDER: ReferralStatus[] = ['to_reward', 'free_session_used', 'signed_up', 'rewarded']

type Filter = 'to_reward' | 'all'

export default function ReferralsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [rows, setRows] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('to_reward')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const filleuls = await findReferredClients()
    const withPurchases = await Promise.all(filleuls.map(async (filleul) => {
      const firstPaid = await findFirstPaidPurchase(filleul.id).catch(() => null)
      return { filleul, firstPaid, status: referralStatus(filleul, firstPaid) }
    }))
    setRows(withPurchases)
    setLoading(false)
  }, [])

  useEffect(() => { load().catch(() => setLoading(false)) }, [load])

  const counts = useMemo(() => {
    const c: Record<ReferralStatus, number> = { signed_up: 0, free_session_used: 0, to_reward: 0, rewarded: 0 }
    rows.forEach(r => { c[r.status]++ })
    return c
  }, [rows])

  // Sans parrainage à récompenser, le filtre par défaut afficherait une liste vide : on montre tout.
  const effectiveFilter: Filter = filter === 'to_reward' && counts.to_reward === 0 ? 'all' : filter
  const visible = useMemo(() => rows
    .filter(r => effectiveFilter === 'all' || r.status === 'to_reward')
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      || (b.filleul.referredAt?.toMillis?.() ?? 0) - (a.filleul.referredAt?.toMillis?.() ?? 0)),
  [rows, effectiveFilter])

  async function toggleRewarded(row: ReferralRow, rewarded: boolean) {
    setBusyId(row.filleul.id)
    try {
      await setReferralRewarded(row.filleul.id, rewarded)
      if (rewarded && user) {
        logActivity({
          userId: user.id, userFirstName: user.firstName, userLastName: user.lastName,
          action: 'referral_rewarded',
          description: `${row.filleul.referredByName ?? 'Parrain'} récompensé pour le parrainage de ${row.filleul.firstName} ${row.filleul.lastName}`,
          clientId: row.filleul.referredByClientId,
        })
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <TopBar
        title="Parrainages"
        left={<button onClick={() => router.back()}><ArrowLeft size={20} style={{ color: '#7A7570' }} /></button>}
      />
      <TopBarSpacer />

      {loading ? <ListSkeleton /> : rows.length === 0 ? (
        <EmptyState
          icon={Gift}
          title="Aucun parrainage"
          description="Les clients partagent leur lien depuis l'accueil de l'app. Chaque filleul inscrit apparaîtra ici."
        />
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {STATUS_ORDER.map(s => (
              <div key={s} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-center">
                <p className="amount-mono text-[18px] font-semibold text-[var(--color-text-primary)]">{counts[s]}</p>
                <p className="text-[10px] leading-tight text-[var(--color-text-tertiary)]">{REFERRAL_STATUS_LABELS[s]}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {(['to_reward', 'all'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="h-8 px-3 rounded-full text-[13px] font-medium border"
                style={{
                  background: effectiveFilter === f ? 'var(--color-text-primary)' : 'var(--color-surface)',
                  color: effectiveFilter === f ? '#fff' : 'var(--color-text-primary)',
                  borderColor: effectiveFilter === f ? 'var(--color-text-primary)' : 'var(--color-border)',
                }}>
                {f === 'to_reward' ? `À récompenser (${counts.to_reward})` : `Tous (${rows.length})`}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map(row => (
              <ReferralCard
                key={row.filleul.id}
                row={row}
                busy={busyId === row.filleul.id}
                onRewarded={(v) => toggleRewarded(row, v)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function ReferralCard({ row, busy, onRewarded }: { row: ReferralRow; busy: boolean; onRewarded: (rewarded: boolean) => void }) {
  const { filleul, firstPaid, status } = row
  const fmt = (d: Date) => format(d, 'd MMM yyyy', { locale: fr })
  return (
    <div className="p-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/clients/${filleul.id}` as never} className="text-[14px] font-medium text-[var(--color-text-primary)] no-underline">
            {filleul.firstName} {filleul.lastName}
          </Link>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            Parrainé par{' '}
            {filleul.referredByClientId ? (
              <Link href={`/clients/${filleul.referredByClientId}` as never} className="font-medium text-[var(--color-text-primary)] no-underline">
                {filleul.referredByName || 'un client'}
              </Link>
            ) : '—'}
            {filleul.referredAt && <> · inscrit le {fmt(filleul.referredAt.toDate())}</>}
          </p>
        </div>
        <Badge variant={STATUS_BADGE[status]}>{REFERRAL_STATUS_LABELS[status]}</Badge>
      </div>

      <p className="text-[12px] text-[var(--color-text-tertiary)] mt-2">
        {firstPaid ? `1er achat payant : ${firstPaid.label} · ${fmt(firstPaid.date)}` : 'Aucun achat payant pour l\'instant'}
        {filleul.referralFreeSessionUsed ? ' · séance offerte utilisée' : ' · séance offerte pas encore utilisée'}
      </p>

      {status === 'to_reward' && (
        <button onClick={() => onRewarded(true)} disabled={busy}
          className="mt-3 w-full h-9 rounded-[var(--radius-button)] text-[13px] font-semibold"
          style={{ background: 'var(--color-text-primary)', color: '#fff' }}>
          {busy ? 'Enregistrement…' : '✓ Récompensé'}
        </button>
      )}
      {status === 'rewarded' && (
        <p className="text-[12px] text-[var(--color-text-tertiary)] mt-2">
          Récompensé le {filleul.referralRewardedAt?.toDate ? fmt(filleul.referralRewardedAt.toDate()) : '…'}
          {' · '}
          <button onClick={() => onRewarded(false)} disabled={busy} className="underline text-[12px] text-[var(--color-text-tertiary)]">
            annuler
          </button>
        </p>
      )}
    </div>
  )
}
