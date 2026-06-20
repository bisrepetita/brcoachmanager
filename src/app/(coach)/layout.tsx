import { AuthGuard } from '@/components/providers/AuthGuard'
import { NotificationProvider } from '@/components/providers/NotificationProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { BottomNav } from '@/components/layout/BottomNav'

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div style={{ minHeight: '100dvh', background: 'var(--color-background)' }}>
        <main style={{ paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}>
          <AuthGuard>
            <NotificationProvider>
              {children}
            </NotificationProvider>
          </AuthGuard>
        </main>
      </div>
      <BottomNav />
    </ToastProvider>
  )
}
