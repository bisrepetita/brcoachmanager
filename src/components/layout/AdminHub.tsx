import Link from 'next/link'
import { Users, MapPin, Briefcase, UsersRound, BarChart2, Settings, ChevronRight, ScrollText } from 'lucide-react'

const ADMIN_LINKS = [
  { href: '/admin/coaches', label: 'Coachs', description: 'Gérer les coachs', icon: Users },
  { href: '/admin/locations', label: 'Lieux', description: 'Salles et espaces', icon: MapPin },
  { href: '/admin/services', label: 'Services', description: 'Types de séances et tarifs', icon: Briefcase },
  { href: '/admin/groups', label: 'Groupes clients', description: 'Groupes pour les séances', icon: UsersRound },
  { href: '/admin/stats', label: 'Statistiques', description: 'CA, séances par service et coach', icon: BarChart2 },
  { href: '/admin/independent-tracking', label: 'Suivi indépendants', description: 'Location de salle', icon: BarChart2 },
  { href: '/admin/activity', label: 'Journal d\'activité', description: 'Historique des modifications', icon: ScrollText },
  { href: '/admin/settings', label: 'Réglages', description: 'Template WhatsApp, configuration', icon: Settings },
] as const

export function AdminHub() {
  return (
    <section>
      <p className="section-label mb-3">Administration</p>
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden divide-y divide-[var(--color-border)]">
        {ADMIN_LINKS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-4 py-3.5 press-effect hover:bg-[var(--color-surface-elevated)] transition-colors"
          >
            <div
              className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
              style={{ background: '#F0EDE8' }}
            >
              <Icon size={18} style={{ color: '#7A7570' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{label}</p>
              <p className="text-[12px] text-[var(--color-text-tertiary)]">{description}</p>
            </div>
            <ChevronRight size={16} style={{ color: '#C8C4BC' }} />
          </Link>
        ))}
      </div>
    </section>
  )
}
