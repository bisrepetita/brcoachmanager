'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { AuthGuard } from '@/components/providers/AuthGuard'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, primaryButton, pageTitle, inputStyle, Field } from '@/components/client/ClientUI'
import { CLIENT_HOME } from '@/lib/utils/client-routes'

export default function CompleteProfilePage() {
  return (
    <AuthGuard requireClient>
      <Suspense fallback={null}>
        <CompleteProfileContent />
      </Suspense>
    </AuthGuard>
  )
}

function CompleteProfileContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || CLIENT_HOME
  const { profile, loading: profileLoading } = useClientProfile()
  const [phone, setPhone] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  // Le profil a déjà un téléphone (ex: onglet dupliqué après complétion) — rien à faire ici.
  React.useEffect(() => {
    if (!profileLoading && profile?.phone) {
      router.replace(redirectTo as never)
    }
  }, [profileLoading, profile, redirectTo, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setError(null)
    if (!phone.trim()) { setError('Le numéro de téléphone est requis.'); return }
    setLoading(true)
    try {
      await updateDoc(doc(db, 'clients', profile.clientId), { phone: phone.trim(), updatedAt: serverTimestamp() })
      router.replace(redirectTo as never)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="client-theme" style={{ minHeight: '100dvh', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 32px', display: 'flex', flexDirection: 'column' }}>
        <header style={{ display: 'flex', alignItems: 'center', height: 40 }}>
          <BrandLogo />
        </header>

        <h1 style={{ ...pageTitle, margin: '40px 0 8px' }}>
          {profile?.firstName ? `Bienvenue ${profile.firstName}` : 'Encore une étape'}
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 15, color: C.muted, lineHeight: 1.5 }}>
          Ton coach a besoin de ton numéro de téléphone pour te contacter si besoin.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field id="phone" label="Téléphone">
            <input
              id="phone" type="tel" autoComplete="tel" required autoFocus value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 000 00 00" style={inputStyle}
            />
          </Field>

          {error && (
            <div style={{ padding: '12px 16px', borderRadius: 16, background: C.redBg, color: C.red, fontSize: 14, lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{ ...primaryButton, height: 52, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Enregistrement…' : 'Continuer'}
          </button>
        </form>
      </div>
    </div>
  )
}
