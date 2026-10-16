'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getAuth } from 'firebase/auth'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronRight, Building } from 'lucide-react'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { firebaseApp } from '@/lib/firebase/config'
import { useAuth } from '@/lib/hooks/useAuth'
import type { PrivateSessionView } from '@/types'
import { BrandLoader } from '@/components/shared/BrandLoader'

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
  const router = useRouter()
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

  if (loading || authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
        <BrandLoader />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#1A1A18', fontSize: 15, fontWeight: 600, margin: 0 }}>Lien invalide ou expiré</p>
        <p style={{ color: '#A09890', fontSize: 13, margin: '6px 0 0' }}>Demande un nouveau lien à la personne qui te l&apos;a envoyé.</p>
      </div>
    )
  }

  const canBook = !!firebaseUser && data.isMember
  const isStaff = !!user?.roles?.some(r => r === 'coach' || r === 'admin')

  return (
    <>
      <TopBar title={data.group.name} />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Building size={20} color="#7A7570" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>Séances {data.group.name}</p>
            <p style={{ fontSize: 13, color: '#7A7570', margin: '4px 0 0' }}>
              {canBook
                ? 'Tu fais partie du groupe : ses séances apparaissent aussi dans ton planning. Choisis une séance pour t\'inscrire.'
                : 'Séances réservées aux membres du groupe.'}
            </p>
          </div>
        </div>

        {!firebaseUser && (
          <div style={{ background: '#fff', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 13, color: '#1A1A18', margin: 0 }}>Pour t&apos;inscrire, connecte-toi ou crée ton compte (1 minute) :</p>
            <button
              onClick={() => router.push(`/signup?redirect=${redirect}` as never)}
              style={{ height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600 }}
            >
              Créer mon compte
            </button>
            <button
              onClick={() => router.push(`/login?redirect=${redirect}` as never)}
              style={{ height: 40, borderRadius: 10, border: '1px solid #E5E1DA', cursor: 'pointer', background: '#fff', color: '#1A1A18', fontSize: 13, fontWeight: 500 }}
            >
              J&apos;ai déjà un compte
            </button>
          </div>
        )}

        {/* Compte connecté sans fiche client : soit un coach/admin qui consulte le lien (cas typique
            en interne), soit un compte client dont le profil n'a pas été finalisé. */}
        {firebaseUser && !data.hasClientProfile && (isStaff ? (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F0EDE8', color: '#7A7570', fontSize: 13 }}>
            Tu es connecté avec un compte coach : voici ce que voit un participant. Pour tester l&apos;inscription, ouvre le lien en navigation privée.
          </div>
        ) : (
          <button
            onClick={() => router.push(`/complete-profile?redirect=${redirect}` as never)}
            style={{ height: 44, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#1A1A18', color: '#fff', fontSize: 14, fontWeight: 600 }}
          >
            Finaliser mon profil pour m&apos;inscrire
          </button>
        ))}

        <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 0' }}>
          Prochaines séances
        </p>

        {data.sessions.length === 0 ? (
          <p style={{ fontSize: 13, color: '#A09890', margin: 0 }}>Aucune séance planifiée pour le moment.</p>
        ) : data.sessions.map(s => {
          const isFull = s.confirmedCount >= s.maxParticipants
          const status = s.myStatus === 'confirmed' ? 'Inscrit ✓' : s.myStatus === 'pending_payment' ? 'Paiement en attente' : isFull ? 'Complet' : undefined
          return (
            <button
              key={s.id}
              onClick={() => router.push((canBook ? `/group-sessions/${s.id}` : `/login?redirect=${redirect}`) as never)}
              style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: '#7A7570', margin: 0, textTransform: 'capitalize' }}>
                  {format(new Date(s.startAt), 'EEEE d MMMM · HH:mm', { locale: fr })}
                </p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: '2px 0 0' }}>{s.title}</p>
                <p style={{ fontSize: 12, color: '#A09890', margin: '2px 0 0' }}>
                  {s.coachNames && s.coachNames.length > 0 ? `Avec ${s.coachNames.join(' & ')} · ` : ''}
                  {s.confirmedCount}/{s.maxParticipants} places · {s.price === 0 ? 'Gratuit' : `Participation ${s.price.toFixed(2)} CHF`}
                </p>
              </div>
              {status && (
                <span style={{ fontSize: 11, fontWeight: 600, color: s.myStatus === 'confirmed' ? '#2D7A4F' : s.myStatus ? '#B26A00' : '#C0392B', flexShrink: 0 }}>
                  {status}
                </span>
              )}
              <ChevronRight size={16} color="#C8C4BC" style={{ flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
    </>
  )
}
