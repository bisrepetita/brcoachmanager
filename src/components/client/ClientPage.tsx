'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { C, iconCircle, arrowCircle, pageTitle } from './ClientUI'

/**
 * Gabarit des pages de l'espace client : en-tête (logo, ou bouton retour pour une sous-page),
 * grand titre, sous-titre optionnel, puis le contenu en colonne.
 */
export function ClientPage({ title, subtitle, back, backFallback = '/home', right, children }: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Sous-page : bouton retour à la place du logo */
  back?: boolean
  /** Destination du retour quand il n'y a pas d'historique (lien ouvert depuis un mail) */
  backFallback?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  const router = useRouter()
  function goBack() {
    if (window.history.length > 1) router.back()
    else router.push(backFallback as never)
  }
  return (
    <div style={{ padding: 'calc(16px + env(safe-area-inset-top, 0px)) 20px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 40 }}>
        {back ? (
          <button
            onClick={goBack}
            aria-label="Retour"
            className="press-effect"
            style={{ width: 38, height: 38, borderRadius: 9999, border: 'none', background: '#E0E0DF', color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={18} />
          </button>
        ) : <BrandLogo />}
        {right}
      </header>
      <div style={{ margin: back ? '24px 0 20px' : '40px 0 20px' }}>
        <h1 style={pageTitle}>{title}</h1>
        {subtitle && <p style={{ margin: '8px 0 0', fontSize: 15, color: C.muted, lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
    </div>
  )
}

/** Titre de section au-dessus d'une carte (« À venir », « Historique »…). */
export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '12px 4px 0' }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{children}</p>
      {aside && <p style={{ margin: 0, fontSize: 13, color: C.muted }}>{aside}</p>}
    </div>
  )
}

/** Ligne de menu cliquable (icône, libellé, flèche) à placer dans une carte. */
export function MenuRow({ href, icon, label, sub, divider }: {
  href: string
  icon: React.ReactNode
  label: string
  sub?: string
  divider?: boolean
}) {
  return (
    <Link
      href={href as never}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', color: C.ink, textDecoration: 'none',
        borderTop: divider ? `1px solid ${C.line}` : undefined,
      }}
    >
      <span style={{ ...iconCircle, width: 40, height: 40, background: C.stone }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 13, color: C.muted, marginTop: 1 }}>{sub}</span>}
      </span>
      <span style={{ ...arrowCircle, background: C.bg }}><ChevronRight size={15} /></span>
    </Link>
  )
}

/** Message d'erreur arrondi. */
export function ErrorNotice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: 16, background: C.redBg, color: C.red, fontSize: 14, lineHeight: 1.4 }}>
      {children}
    </div>
  )
}

/** Carte vide (aucune réservation, aucun pack…) avec action optionnelle. */
export function EmptyCard({ icon, title, text, action }: {
  icon: React.ReactNode
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: 22, padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
      <span style={{ ...iconCircle, background: C.stone, marginBottom: 6 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</p>
      {text && <p style={{ margin: 0, fontSize: 14, color: C.muted }}>{text}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  )
}
