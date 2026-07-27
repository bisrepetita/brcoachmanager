'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  Users, MapPin, Briefcase, UsersRound, BarChart2,
  Settings, ScrollText, LogOut, User, X, ChevronRight, Users2, Percent, Repeat,
} from 'lucide-react'

interface BurgerMenuCtx {
  isOpen: boolean
  open: () => void
  close: () => void
}

const BurgerMenuContext = createContext<BurgerMenuCtx | null>(null)

export function useBurgerMenu() {
  return useContext(BurgerMenuContext)
}

const ADMIN_LINKS = [
  { href: '/admin/coaches',              label: 'Coachs',               description: 'Gérer les coachs',            icon: Users },
  { href: '/admin/locations',            label: 'Lieux',                description: 'Salles et espaces',           icon: MapPin },
  { href: '/admin/services',             label: 'Services',             description: 'Types de séances et tarifs',  icon: Briefcase },
  { href: '/admin/discounts',            label: 'Remises',              description: 'Codes promo et rabais clients', icon: Percent },
  { href: '/admin/subscriptions',        label: 'Abonnements',          description: 'Plans et attribution aux clients', icon: Repeat },
  { href: '/admin/groups',               label: 'Groupes clients',      description: 'Groupes pour les séances',    icon: UsersRound },
  { href: '/manage-group-sessions',       label: 'Séances collectives',  description: 'Cours avec inscription client', icon: Users2 },
  { href: '/admin/stats',                label: 'Statistiques',         description: 'CA, séances, coachs',         icon: BarChart2 },
  { href: '/admin/independent-tracking', label: 'Suivi indépendants',   description: 'Location de salle',           icon: BarChart2 },
  { href: '/admin/activity',             label: 'Journal d\'activité',  description: 'Historique des modifications', icon: ScrollText },
  { href: '/admin/settings',             label: 'Réglages entreprise',  description: 'Template WhatsApp, config',   icon: Settings },
] as const

const COACH_LINKS = [
  { href: '/manage-group-sessions', label: 'Séances collectives', description: 'Cours avec inscription client', icon: Users2 },
  { href: '/independent', label: 'Suivi location de salle', description: 'Montants dus à l\'entreprise', icon: BarChart2 },
] as const

function BurgerDrawer({ isOpen, close }: { isOpen: boolean; close: () => void }) {
  const { user, isAdmin, logout } = useAuth()
  const pathname = usePathname()

  useEffect(() => { close() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  const links = isAdmin ? ADMIN_LINKS : COACH_LINKS

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 80,
          background: 'rgba(0,0,0,0.35)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 90,
          width: 'min(320px, 88vw)',
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #E5E1DA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: user?.color ?? '#1A1A18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={16} color="#fff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1A1A18', lineHeight: 1.2 }}>{user?.firstName} {user?.lastName}</p>
              <p style={{ margin: 0, fontSize: 11, color: '#A09890', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
            </div>
          </div>
          <button onClick={close} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#7A7570', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {/* Nav links */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>
            {isAdmin ? 'Administration' : 'Mon espace'}
          </p>
          {links.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={close}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', textDecoration: 'none', borderBottom: '1px solid #F5F3F0' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={17} style={{ color: '#7A7570' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#1A1A18' }}>{label}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#A09890' }}>{description}</p>
              </div>
              <ChevronRight size={15} style={{ color: '#C8C4BC', flexShrink: 0 }} />
            </Link>
          ))}

          <p style={{ fontSize: 10, fontWeight: 700, color: '#A09890', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 16px 4px' }}>
            Compte
          </p>
          <Link
            href="/settings"
            onClick={close}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', textDecoration: 'none', borderBottom: '1px solid #F5F3F0' }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Settings size={17} style={{ color: '#7A7570' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#1A1A18' }}>Paramètres</p>
              <p style={{ margin: 0, fontSize: 12, color: '#A09890' }}>Google Calendar, notifications</p>
            </div>
            <ChevronRight size={15} style={{ color: '#C8C4BC', flexShrink: 0 }} />
          </Link>
        </div>

        {/* Footer logout */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E1DA' }}>
          <button
            onClick={() => { logout(); close() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', fontSize: 14, fontWeight: 500 }}
          >
            <LogOut size={16} />
            Se déconnecter
          </button>
        </div>
      </div>
    </>
  )
}

export function BurgerMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <BurgerMenuContext.Provider value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}>
      {children}
      <BurgerDrawer isOpen={isOpen} close={() => setIsOpen(false)} />
    </BurgerMenuContext.Provider>
  )
}
