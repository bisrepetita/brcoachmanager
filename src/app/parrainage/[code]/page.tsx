'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { storeReferralCode } from '@/lib/utils/referral'
import { CLIENT_HOME } from '@/lib/utils/client-routes'

// Page d'arrivée d'un lien de parrainage. Le code est gardé dans le navigateur jusqu'à la création
// du compte (cf. lib/utils/referral), qui rattache alors le filleul à son parrain.
export default function ReferralLandingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const { firebaseUser, loading: authLoading } = useAuth()
  const [referrerFirstName, setReferrerFirstName] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'valid' | 'invalid'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/referral/${encodeURIComponent(code)}`)
      .then(async res => {
        if (cancelled) return
        if (!res.ok) { setState('invalid'); return }
        const { firstName } = (await res.json()) as { firstName: string }
        setReferrerFirstName(firstName)
        setState('valid')
        storeReferralCode(code.toUpperCase())
      })
      .catch(() => { if (!cancelled) setState('invalid') })
    return () => { cancelled = true }
  }, [code])

  const loading = state === 'loading' || authLoading

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px' }}>
      <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Bis Repetita</span>
      </header>

      {loading ? null : state === 'invalid' ? (
        <>
          <h1 style={title}>Lien introuvable</h1>
          <p style={text}>Ce lien de parrainage n&apos;est pas ou plus valide. Tu peux quand même découvrir nos séances.</p>
          <Link href="/group-sessions" style={primaryButton}>Voir le planning</Link>
        </>
      ) : (
        <>
          <h1 style={title}>{referrerFirstName} t&apos;invite chez Bis Repetita</h1>

          <div style={{ background: '#1C1C1C', color: '#fff', borderRadius: 22, padding: 20, display: 'flex', gap: 14, alignItems: 'center', margin: '0 0 16px' }}>
            <span style={{ width: 44, height: 44, borderRadius: 9999, background: '#333333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Gift size={18} strokeWidth={1.75} />
            </span>
            <span>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 600 }}>Ta première séance est offerte</span>
              <span style={{ display: 'block', fontSize: 13, opacity: 0.75, marginTop: 2 }}>Séance collective ou individuelle, au choix.</span>
            </span>
          </div>

          {firebaseUser ? (
            <>
              <p style={text}>Tu as déjà un compte : l&apos;offre de parrainage est réservée aux nouveaux clients.</p>
              <Link href={CLIENT_HOME} style={primaryButton}>Aller à l&apos;accueil</Link>
            </>
          ) : (
            <>
              <p style={text}>Crée ton compte en une minute, puis réserve ta séance : elle sera automatiquement offerte.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link href="/signup" style={primaryButton}>Créer mon compte</Link>
                <Link href="/group-sessions" style={secondaryButton}>Découvrir le planning</Link>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const title: React.CSSProperties = { margin: '40px 0 24px', fontSize: 34, fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 1.1 }
const text: React.CSSProperties = { margin: '0 0 20px', fontSize: 15, color: '#6E6E6B', lineHeight: 1.5 }
const primaryButton: React.CSSProperties = {
  height: 48, borderRadius: 9999, background: '#1C1C1C', color: '#fff', textDecoration: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 600,
}
const secondaryButton: React.CSSProperties = {
  ...primaryButton, background: 'transparent', color: '#1C1C1C', border: '1px solid #CFCFCC', fontWeight: 500,
}
