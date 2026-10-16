'use client'

import { Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, pageTitle, primaryButton } from '@/components/client/ClientUI'
import { CLIENT_HOME } from '@/lib/utils/client-routes'

const REDIRECT_DELAY_MS = 2500

function destinationFor(type: string | null, id: string | null): string | null {
  if (type === 'groupSession' && id) return `/group-sessions/${id}`
  if (type === 'subscription') return '/subscriptions'
  if (type === 'pack') return '/packs'
  return null
}

function PaiementConfirmeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const type = searchParams.get('type')
  const destination = destinationFor(type, searchParams.get('id'))
  const message = type === 'pack'
    ? 'Ton pack a bien été payé : tes séances seront disponibles dans quelques instants.'
    : type === 'subscription'
      ? 'Ton abonnement a bien été payé. À très vite chez Bis Repetita !'
      : 'Ta séance a bien été payée. À très vite chez Bis Repetita !'

  useEffect(() => {
    if (!destination) return
    const timer = setTimeout(() => router.replace(destination as never), REDIRECT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [destination, router])

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
          <BrandLogo />
        </header>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>
          <span style={{
            width: 72, height: 72, borderRadius: 9999, background: C.charcoal, color: '#fff', marginBottom: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={32} strokeWidth={2.5} />
          </span>
          <h1 style={{ ...pageTitle, margin: '0 0 10px' }}>Paiement confirmé</h1>
          <p style={{ margin: 0, fontSize: 16, color: C.muted, lineHeight: 1.5 }}>{message}</p>
          {destination ? (
            <p style={{ margin: '24px 0 0', fontSize: 13, color: C.muted }}>Redirection en cours…</p>
          ) : (
            <Link href={CLIENT_HOME} style={{ ...primaryButton, height: 50, marginTop: 28 }}>Retour à l&apos;accueil</Link>
          )}
        </div>
      </div>
    </div>
  )
}

export default function PaiementConfirmePage() {
  return (
    <Suspense fallback={null}>
      <PaiementConfirmeContent />
    </Suspense>
  )
}
