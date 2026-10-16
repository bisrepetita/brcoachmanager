'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getAuth } from 'firebase/auth'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { firebaseApp } from '@/lib/firebase/config'
import { useAuth } from '@/lib/hooks/useAuth'
import type { PrivateSessionView } from '@/types'
import { BrandLoader } from '@/components/shared/BrandLoader'
import { ClientPage, SectionTitle, EmptyCard } from '@/components/client/ClientPage'
import { C, card, primaryButton, secondaryButton, DateBox, coachFirstNames } from '@/components/client/ClientUI'

interface GroupPageData {
  group: { id: string; name: string }
  isMember: boolean
  hasClientProfile: boolean
  sessions: PrivateSessionView[]
}

// Page du lien privé /groupe/{token} : présente le groupe et ses séances à venir. Un client connecté
// qui l'ouvre rejoint automatiquement le groupe (il verra ensuite ses séances dans son planning) ;
// un visiteur anonyme est invité à se connecter / créer un compte, puis revient ici.
export default function PrivateGroupLinkPage() {
  const params = useParams<{ token: string }>()
  const { firebaseUser, user, loading: authLoading } = useAuth()
  const [data, setData] = useState<GroupPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    async function load() {
      const idToken = firebaseUser ? await getAuth(firebaseApp).currentUser?.getIdToken() : undefined
      const headers: Record<string, string> = idToken ? { Authorization: `Bearer ${idToken}` } : {}
      if (idToken) {
        // Échec possible (compte pas encore lié à une fiche client) : la page s'affiche quand même,
        // avec un message, plutôt que de bloquer.
        await fetch('/api/private-groups/join', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: params.token }),
        }).catch(() => {})
      }
      const res = await fetch(`/api/private-groups/by-token/${params.token}`, { headers })
      if (cancelled) return
      if (!res.ok) { setNotFound(true); return }
      setData(await res.json())
    }
    load().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [params.token, firebaseUser, authLoading])

  const redirect = encodeURIComponent(`/groupe/${params.token}`)

  if (loading || authLoading) return <BrandLoader fullScreen />

  if (notFound || !data) {
    return (
      <ClientPage title="Lien invalide" subtitle="Ce lien est invalide ou a expiré. Demande un nouveau lien à la personne qui te l'a envoyé.">
        <Link href="/group-sessions" style={primaryButton}>Voir le planning</Link>
      </ClientPage>
    )
  }

  const canBook = !!firebaseUser && data.isMember
  const isStaff = !!user?.roles?.some(r => r === 'coach' || r === 'admin')

  return (
    <ClientPage
      title={data.group.name}
      subtitle={canBook
        ? 'Tu fais partie du groupe : ses séances apparaissent aussi dans ton planning.'
        : 'Séances réservées aux membres du groupe.'}
    >
      {!firebaseUser && (
        <div style={{ ...card, background: C.charcoal, color: '#fff' }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Inscris-toi aux séances</p>
          <p style={{ margin: '4px 0 16px', fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>Connecte-toi ou crée ton compte en une minute.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/signup?redirect=${redirect}` as never} style={{ ...primaryButton, background: C.card, color: C.ink }}>Créer mon compte</Link>
            <Link href={`/login?redirect=${redirect}` as never} style={{ ...secondaryButton, color: '#fff', border: '1px solid rgba(255,255,255,0.28)' }}>J&apos;ai déjà un compte</Link>
          </div>
        </div>
      )}

      {/* Compte connecté sans fiche client : soit un coach/admin qui consulte le lien (cas typique
          en interne), soit un compte client dont le profil n'a pas été finalisé. */}
      {firebaseUser && !data.hasClientProfile && (isStaff ? (
        <div style={{ padding: '12px 16px', borderRadius: 18, background: C.stone, fontSize: 13, lineHeight: 1.45 }}>
          Tu es connecté avec un compte coach : voici ce que voit un participant. Pour tester l&apos;inscription, ouvre le lien en navigation privée.
        </div>
      ) : (
        <Link href={`/complete-profile?redirect=${redirect}` as never} style={primaryButton}>
          Finaliser mon profil pour m&apos;inscrire
        </Link>
      ))}

      <SectionTitle aside={data.sessions.length > 0 ? `${data.sessions.length}` : undefined}>Prochaines séances</SectionTitle>

      {data.sessions.length === 0 ? (
        <EmptyCard icon={<CalendarDays size={18} strokeWidth={1.75} />} title="Aucune séance planifiée" text="Les prochaines séances apparaîtront ici." />
      ) : (
        <div style={{ ...card, padding: '6px 18px' }}>
          {data.sessions.map((s, idx) => {
            const start = new Date(s.startAt)
            const end = new Date(s.endAt)
            const spotsLeft = Math.max(0, s.maxParticipants - s.confirmedCount)
            const reserved = !!s.myStatus
            const pending = s.myStatus === 'pending_payment'
            const coaches = coachFirstNames(s.coachNames)
            return (
              <Link
                key={s.id}
                href={(canBook ? `/group-sessions/${s.id}` : `/login?redirect=${redirect}`) as never}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', color: C.ink, textDecoration: 'none',
                  borderTop: idx > 0 ? `1px solid ${C.line}` : undefined,
                }}
              >
                <DateBox date={start} dark={reserved} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{format(start, 'HH:mm')} – {format(end, 'HH:mm')}</p>
                  <p style={{ margin: '1px 0 0', fontSize: 13, color: C.muted, lineHeight: 1.35 }}>
                    {s.title}{coaches && ` · ${coaches}`}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: 12, fontWeight: 500, color: s.price === 0 ? C.green : C.muted }}>
                    {s.price === 0 ? 'Gratuit' : `Participation ${s.price.toFixed(2)} CHF`}
                    {!reserved && spotsLeft > 0 && spotsLeft <= 3 && <span style={{ color: C.amber }}> · plus que {spotsLeft} place{spotsLeft > 1 ? 's' : ''}</span>}
                  </p>
                </div>
                {reserved ? (
                  <span style={{ ...pill, background: pending ? C.amberBg : C.charcoal, color: pending ? C.amber : '#fff', border: 'none' }}>
                    {pending ? 'À payer' : 'Inscrit'}
                  </span>
                ) : spotsLeft === 0 ? (
                  <span style={{ fontSize: 13, color: C.muted, flexShrink: 0 }}>Complet</span>
                ) : (
                  <span style={pill}>{canBook ? 'S\'inscrire' : 'Voir'}</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </ClientPage>
  )
}

const pill: React.CSSProperties = {
  height: 38, padding: '0 16px', borderRadius: 9999, border: `1px solid ${C.border}`, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', fontSize: 14, fontWeight: 600, color: C.ink,
}
