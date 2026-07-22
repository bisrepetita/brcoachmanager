'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Ticket } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/group-sessions',  label: 'Planning',         icon: CalendarDays },
  { href: '/my-enrollments',  label: 'Mes inscriptions', icon: Ticket },
] as const

export function BottomNavClient() {
  const pathname = usePathname()

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

          return (
            <Link
              key={href}
              href={href}
              className="relative flex flex-col items-center justify-center flex-1 h-full no-underline"
              style={{ color: isActive ? '#1A1A18' : '#7A7570' }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
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
