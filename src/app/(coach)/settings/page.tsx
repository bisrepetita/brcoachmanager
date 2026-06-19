'use client'

import Link from 'next/link'
import { TopBar, TopBarSpacer } from '@/components/layout/TopBar'
import { useAuth } from '@/lib/hooks/useAuth'
import { AdminHub } from '@/components/layout/AdminHub'
import { LogOut, User, BarChart2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function SettingsPage() {
  const { user, isAdmin, logout } = useAuth()

  return (
    <>
      <TopBar title="Paramètres" />
      <TopBarSpacer />

      <div className="p-4 space-y-6">
        {/* Profil */}
        <section>
          <p className="section-label mb-3">Mon compte</p>
          <div
            className="flex items-center gap-3 p-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: user?.color ?? '#1A1A18' }}
            >
              <User size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--color-text-primary)] truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[12px] text-[var(--color-text-tertiary)] truncate">{user?.email}</p>
            </div>
          </div>
        </section>

        {/* Admin hub */}
        {isAdmin && <AdminHub />}

        {/* Suivi indépendant — coaches uniquement */}
        {!isAdmin && (
          <section>
            <p className="section-label mb-3">Mode indépendant</p>
            <Link
              href="/independent"
              className="flex items-center gap-3 px-4 py-3.5 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] no-underline press-effect"
            >
              <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center shrink-0" style={{ background: '#F0EDE8' }}>
                <BarChart2 size={18} style={{ color: '#7A7570' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">Suivi location de salle</p>
                <p className="text-[12px] text-[var(--color-text-tertiary)]">Montants dus à l&apos;entreprise</p>
              </div>
              <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
            </Link>
          </section>
        )}

        {/* Déconnexion */}
        <section>
          <Button variant="outline" size="lg" className="w-full" onClick={logout}>
            <LogOut size={16} />
            Se déconnecter
          </Button>
        </section>

        <p className="text-center text-[11px] text-[var(--color-text-disabled)]">
          BRCoachManager · Bis Repetita
        </p>
      </div>
    </>
  )
}
