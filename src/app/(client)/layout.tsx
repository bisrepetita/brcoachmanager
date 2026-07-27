import { ToastProvider } from '@/components/ui/Toast'
import { BottomNavClient } from '@/components/layout/BottomNavClient'
import { PhoneCompletionGuard } from '@/components/providers/PhoneCompletionGuard'

// Pas de AuthGuard ici : le Planning et les abonnements sont consultables sans connexion — chaque
// page qui a vraiment besoin d'un compte client (profil, mes inscriptions) applique son propre
// AuthGuard localement, plutôt que de gater tout l'espace client au niveau du layout.
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <PhoneCompletionGuard />
      <div style={{ minHeight: '100dvh', background: 'var(--color-background)' }}>
        <main style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}>
          {children}
          <BottomNavClient />
        </main>
      </div>
    </ToastProvider>
  )
}
