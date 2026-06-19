import { AuthGuard } from '@/components/providers/AuthGuard'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard requireAdmin>
      <div className="min-h-screen bg-[var(--color-background)]">
        {children}
      </div>
    </AuthGuard>
  )
}
