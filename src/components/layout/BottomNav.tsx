'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, AlertCircle, History, ShoppingBag, Users, Settings } from 'lucide-react'
import { useToCloseCount } from '@/lib/hooks/useToCloseCount'
import { useNotifCount } from '@/components/providers/NotificationProvider'

const NAV_ITEMS = [
  { href: '/calendar',  label: 'Calendrier', icon: CalendarDays },
  { href: '/to-close', label: 'À clôturer', icon: AlertCircle },
  { href: '/history',  label: 'Historique', icon: History },
  { href: '/sales',    label: 'Ventes',     icon: ShoppingBag },
  { href: '/clients',  label: 'Clients',    icon: Users },
  { href: '/settings', label: 'Réglages',   icon: Settings },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const toCloseCount = useToCloseCount()
  const { pendingCount, markAllRead } = useNotifCount()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="flex items-center"
        style={{ height: 'var(--bottom-nav-height)' }}
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          const showBadge = href === '/to-close' && toCloseCount > 0
          const showNotifBadge = href === '/to-close' && pendingCount > 0

          return (
            <Link
              key={href}
              href={href}
              onClick={href === '/to-close' ? markAllRead : undefined}
              className="relative flex flex-col items-center justify-center flex-1 h-full no-underline"
              style={{ color: isActive ? '#1A1A18' : '#7A7570' }}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center leading-none text-[9px] font-bold text-white bg-[#C0392B]">
                    {toCloseCount > 9 ? '9+' : toCloseCount}
                  </span>
                )}
                {showNotifBadge && (
                  <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-[3px] rounded-full flex items-center justify-center leading-none text-[9px] font-bold text-white bg-[#4285F4]">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </div>

              <span
                className="text-[10px] leading-none mt-[3px]"
                style={{ fontWeight: isActive ? 600 : 400 }}
              >
                {label}
              </span>

              {isActive && (
                <span className="absolute bottom-1.5 w-4 h-0.5 rounded-full bg-[#1A1A18]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
