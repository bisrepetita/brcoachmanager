'use client'

import * as React from 'react'
import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { AuthGuard } from '@/components/providers/AuthGuard'
import { Button } from '@/components/ui/button'

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
  const redirectTo = searchParams.get('redirect') || '/group-sessions'
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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--color-background)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <img
            src="/icons/icon-512.png"
            alt="Bis Repetita"
            className="w-14 h-14 mb-5 mx-auto"
            style={{ borderRadius: 'var(--radius-lg)' }}
          />
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
            Encore une étape
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
            Ton coach a besoin de ton numéro de téléphone pour te contacter si besoin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>Téléphone</label>
            <input
              id="phone" type="tel" autoComplete="tel" required autoFocus value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+41 79 000 00 00"
              style={{ borderRadius: 'var(--radius-input)', borderColor: 'var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)' }}
              className="w-full h-12 px-4 border text-[14px] outline-none transition-colors focus:border-[var(--color-border-strong)] placeholder:text-[var(--color-text-disabled)]"
            />
          </div>

          {error && (
            <div className="px-4 py-3" style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', border: '1px solid #FBBCB8' }}>
              <p className="text-[13px] leading-snug" style={{ color: 'var(--color-danger)' }}>{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            Continuer
          </Button>
        </form>
      </div>
    </div>
  )
}
