import { AuthGuard } from '@/components/providers/AuthGuard'
import { ToastProvider } from '@/components/ui/Toast'
import { BottomNavClient } from '@/components/layout/BottomNavClient'

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div style={{ minHeight: '100dvh', background: 'var(--color-background)' }}>
        <main style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}>
          <AuthGuard requireClient>
            {children}
            <BottomNavClient />
          </AuthGuard>
        </main>
      </div>
    </ToastProvider>
  )
}
