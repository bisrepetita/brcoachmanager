'use client'

import { ChevronLeft, LogOut, User, Repeat, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { AuthGuard } from '@/components/providers/AuthGuard'

export default function ClientProfilePage() {
  return (
    <AuthGuard requireClient>
      <ClientProfileContent />
    </AuthGuard>
  )
}

function ClientProfileContent() {
  const router = useRouter()
  const { logout } = useAuth()
  const { profile, loading } = useClientProfile()

  return (
    <>
      <TopBar
        title="Mon profil"
        left={
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={20} color="#1A1A18" />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <p style={{ color: '#A09890', fontSize: 14 }}>Chargement…</p>
        ) : profile ? (
          <div style={{ background: '#fff', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={20} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18', margin: 0 }}>{profile.firstName} {profile.lastName}</p>
              {profile.email && <p style={{ fontSize: 13, color: '#7A7570', margin: '2px 0 0' }}>{profile.email}</p>}
              <p style={{ fontSize: 13, color: '#7A7570', margin: '2px 0 0' }}>{profile.sessionCredits} crédit(s) de séance</p>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#A09890' }}>Profil introuvable.</p>
        )}

        <button
          onClick={() => router.push('/subscriptions' as never)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            height: 52, borderRadius: 10, border: '1px solid #E5E1DA', cursor: 'pointer',
            background: '#fff', padding: '0 14px',
          }}
        >
          <Repeat size={16} color="#7A7570" />
          <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 500, color: '#1A1A18' }}>Mon abonnement</span>
          <ChevronRight size={16} color="#A09890" />
        </button>

        <button
          onClick={logout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            height: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: '#FDECEA', color: '#C0392B', fontSize: 14, fontWeight: 500,
          }}
        >
          <LogOut size={16} />
          Se déconnecter
        </button>
      </div>
    </>
  )
}
