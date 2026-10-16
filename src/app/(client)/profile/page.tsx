'use client'

import { LogOut, Repeat, Layers, Ticket } from 'lucide-react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useClientProfile } from '@/lib/hooks/useClientProfile'
import { AuthGuard } from '@/components/providers/AuthGuard'
import { BrandLoader } from '@/components/shared/BrandLoader'
import { ClientPage, MenuRow } from '@/components/client/ClientPage'
import { C, card, secondaryButton } from '@/components/client/ClientUI'

export default function ClientProfilePage() {
  return (
    <AuthGuard requireClient>
      <ClientProfileContent />
    </AuthGuard>
  )
}

function ClientProfileContent() {
  const { logout } = useAuth()
  const { profile, loading } = useClientProfile()
  const initial = profile?.firstName.trim().charAt(0).toUpperCase() ?? ''

  return (
    <ClientPage title="Profil">
      {loading ? (
        <BrandLoader />
      ) : profile ? (
        <div style={{ ...card, background: C.charcoal, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 56, height: 56, borderRadius: 9999, background: C.card, color: C.ink, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 600,
          }}>
            {initial}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{profile.firstName} {profile.lastName}</p>
            {profile.email && <p style={{ ...onDarkLine, overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</p>}
            {profile.phone && <p style={onDarkLine}>{profile.phone}</p>}
            {profile.sessionCredits > 0 && (
              <p style={onDarkLine}>{profile.sessionCredits} crédit{profile.sessionCredits > 1 ? 's' : ''} de séance</p>
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: C.muted }}>Profil introuvable.</p>
      )}

      <div style={{ ...card, padding: '4px 18px' }}>
        <MenuRow href="/my-enrollments" icon={<Ticket size={17} strokeWidth={1.75} />} label="Mes inscriptions" sub="Séances réservées et historique" />
        <MenuRow href="/subscriptions" icon={<Repeat size={17} strokeWidth={1.75} />} label="Mon abonnement" sub="Séances chaque semaine" divider />
        <MenuRow href="/packs" icon={<Layers size={17} strokeWidth={1.75} />} label="Mes packs de séances" sub="Carnets à utiliser quand tu veux" divider />
      </div>

      <button
        onClick={logout}
        style={{ ...secondaryButton, height: 50, gap: 8, color: C.red, border: `1px solid ${C.line}`, background: 'transparent', marginTop: 8 }}
      >
        <LogOut size={16} />
        Se déconnecter
      </button>
    </ClientPage>
  )
}

const onDarkLine: React.CSSProperties = { margin: '2px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.65)', whiteSpace: 'nowrap' }
