'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, CalendarDays, User } from 'lucide-react'
import { CLIENT_HOME } from '@/lib/utils/client-routes'

// Chaque onglet "possède" aussi les pages qu'on ouvre depuis lui, pour qu'il reste allumé.
const NAV_ITEMS = [
  { href: CLIENT_HOME,       label: 'Accueil',  icon: House,        match: [CLIENT_HOME, '/my-enrollments'] },
  { href: '/group-sessions', label: 'Planning', icon: CalendarDays, match: ['/group-sessions', '/groupe'] },
  { href: '/profile',        label: 'Profil',   icon: User,         match: ['/profile', '/subscriptions', '/packs'] },
] as const

export function BottomNavClient() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
    >
      <div
        className="pointer-events-auto flex items-center gap-1"
        style={{
          padding: 6, borderRadius: 9999, background: '#FAFAFA',
          boxShadow: '0 4px 20px rgba(28,28,28,0.10), 0 1px 3px rgba(28,28,28,0.06)',
        }}
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const isActive = match.some(m => pathname === m || pathname.startsWith(m + '/'))

          return (
            <Link
              key={href}
              href={href as never}
              aria-label={label}
              className="flex items-center justify-center no-underline press-effect"
              style={{
                height: 48, borderRadius: 9999, gap: 8,
                padding: isActive ? '0 18px' : '0 16px',
                background: isActive ? '#2C2C2A' : 'transparent',
                color: isActive ? '#FFFFFF' : '#1C1C1C',
                transition: 'background 160ms ease, padding 160ms ease',
              }}
            >
              <Icon size={18} strokeWidth={1.75} />
              {isActive && <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
