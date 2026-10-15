'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'

export default function ClientHomePage() {
  const { firebaseUser, loading: authLoading } = useAuth()
  const { profile, loading: profileLoading } = useClientProfile()
  const loading = authLoading || profileLoading
  const initial = profile?.firstName.trim().charAt(0).toUpperCase() ?? ''

  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Bis Repetita</span>
        {firebaseUser && (
          <Link
            href="/profile"
            aria-label="Mon profil"
            className="press-effect"
            style={{
              width: 38, height: 38, borderRadius: 9999, background: '#E0E0DF', color: '#1C1C1C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, textDecoration: 'none',
            }}
          >
            {initial}
          </Link>
        )}
      </header>

      <h1 style={{ margin: '40px 0 24px', fontSize: 36, fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
        {loading ? ' ' : profile ? `Bonjour ${profile.firstName}` : 'Bonjour'}
      </h1>

      {!loading && !firebaseUser && (
        <Link
          href={`/login?redirect=${encodeURIComponent('/home')}` as never}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, borderRadius: 9999,
            background: '#1C1C1C', color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
          }}
        >
          Se connecter
        </Link>
      )}
    </div>
  )
}
