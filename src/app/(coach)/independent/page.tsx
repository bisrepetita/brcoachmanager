'use client'

import { useMemo } from 'react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ChevronLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/lib/hooks/useAuth'
import { useIndependentSessions } from '@/lib/hooks/useIndependentSessions'

export default function IndependentPage() {
  const router = useRouter()
  const { user } = useAuth()
  const coachId = user?.id ?? null

  const { pending, resolved, totalPending, loading } = useIndependentSessions(coachId)

  return (
    <>
      <TopBar
        title="Suivi location de salle"
        left={
          <button onClick={() => router.back()} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}>
            <ChevronLeft size={22} />
          </button>
        }
      />
      <TopBarSpacer />

      <div style={{ padding: '12px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12, background: '#F9F8F6', minHeight: '100dvh' }}>

        {loading ? (
          <p style={{ color: '#A09890', fontSize: 14, textAlign: 'center', padding: 20 }}>Chargement…</p>
        ) : (
          <>
            {/* Résumé */}
            <div style={{ background: totalPending > 0 ? '#FDF6EA' : '#F0F9F4', borderRadius: 10, padding: '16px' }}>
              <p style={{ fontSize: 12, color: '#7A7570', margin: '0 0 4px' }}>Montant en attente</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: totalPending > 0 ? '#8A6200' : '#2D7A4F', margin: 0, fontFamily: 'monospace' }}>
                {totalPending.toFixed(2)} CHF
              </p>
              <p style={{ fontSize: 12, color: '#A09890', margin: '4px 0 0' }}>
                {pending.length === 0
                  ? 'Aucune séance en attente — tout est à jour ✓'
                  : `${pending.length} séance${pending.length > 1 ? 's' : ''} en attente de règlement`}
              </p>
            </div>

            {/* En attente */}
            {pending.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                  En attente
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pending.map(({ session, entry }, i) => (
                    <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 0', borderBottom: i < pending.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                      <div>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>
                          {format(session.startAt.toDate(), 'd MMM yyyy', { locale: fr })}
                        </p>
                        <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0' }}>
                          {session.priceSnapshot.serviceName}
                        </p>
                      </div>
                      <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 600, margin: 0, fontFamily: 'monospace', flexShrink: 0 }}>
                        {entry.amountDueToCompany.toFixed(2)} CHF
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Historique */}
            {resolved.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>
                  Historique
                </p>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {resolved.map(({ session, entry }, i) => (
                    <div key={session.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: i < resolved.length - 1 ? '1px solid #F0EDE8' : 'none' }}>
                      <div>
                        <p style={{ fontSize: 14, color: '#1A1A18', fontWeight: 500, margin: 0 }}>
                          {format(session.startAt.toDate(), 'd MMM yyyy', { locale: fr })}
                        </p>
                        <p style={{ fontSize: 13, color: '#7A7570', margin: '1px 0 0', fontFamily: 'monospace' }}>
                          {entry.amountDueToCompany.toFixed(2)} CHF
                        </p>
                      </div>
                      <Badge variant={entry.status === 'paid' ? 'done' : 'offered'}>
                        {entry.status === 'paid' ? 'Payé' : 'Offert'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pending.length === 0 && resolved.length === 0 && (
              <p style={{ fontSize: 13, color: '#A09890', textAlign: 'center', padding: 20 }}>
                Aucune séance en mode indépendant.
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}
