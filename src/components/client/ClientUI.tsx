import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// Briques visuelles du design client « Chaleureux monochrome » (cf. maquettes de l'accueil),
// partagées entre les pages de l'espace client.

export const C = {
  bg: '#F1F1F0', card: '#FAFAFA', soft: '#E6E6E5', ink: '#1C1C1C', muted: '#6E6E6B', line: '#E3E3E1',
  border: '#CFCFCC', green: '#2D7A4F', greenBg: '#E3EFE8', amber: '#B26A00', amberBg: '#FBEFD9',
  red: '#C0392B', redBg: '#F8E3E0',
}

export const card: React.CSSProperties = { background: C.card, borderRadius: 22, padding: 18 }

export const iconCircle: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 9999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export const arrowCircle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export const primaryButton: React.CSSProperties = {
  height: 46, borderRadius: 9999, border: 'none', background: C.ink, color: '#fff', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600,
  textDecoration: 'none', fontFamily: 'inherit',
}

export const secondaryButton: React.CSSProperties = {
  height: 46, borderRadius: 9999, border: `1px solid ${C.border}`, background: 'transparent', color: C.ink, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', fontSize: 14, fontWeight: 500,
  textDecoration: 'none', flexShrink: 0, fontFamily: 'inherit',
}

export const hint: React.CSSProperties = { margin: '8px 0 0', fontSize: 12, color: C.muted }

export const pageTitle: React.CSSProperties = {
  margin: 0, fontSize: 36, fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 1.1,
}

/** Bloc jour (« VEN. 16 ») — noir pour la séance mise en avant, gris clair dans les listes. */
export function DateBox({ date, dark }: { date: Date; dark?: boolean }) {
  const size = dark ? { width: 64, height: 68, radius: 14, day: 26 } : { width: 46, height: 50, radius: 10, day: 19 }
  return (
    <div style={{
      width: size.width, height: size.height, borderRadius: size.radius, flexShrink: 0,
      background: dark ? C.ink : C.soft, color: dark ? '#fff' : C.ink,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: dark ? 11 : 9, fontWeight: 500, textTransform: 'uppercase', opacity: dark ? 0.85 : 0.7, lineHeight: 1.2 }}>
        {format(date, 'EEE', { locale: fr })}
      </span>
      <span style={{ fontSize: size.day, fontWeight: 600, lineHeight: 1.05 }}>{format(date, 'd')}</span>
    </div>
  )
}

/** Pastille de statut (réservation confirmée, paiement en attente, remise…). */
export function Pill({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const colors = {
    green: [C.greenBg, C.green], amber: [C.amberBg, C.amber], red: [C.redBg, C.red], neutral: [C.soft, C.ink],
  }[tone]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 9999,
      background: colors[0], color: colors[1], fontSize: 12, fontWeight: 600, lineHeight: 1.3,
    }}>
      {children}
    </span>
  )
}

/** Prénoms des coachs (« Nicolas & Julie ») à partir des noms complets dénormalisés. */
export function coachFirstNames(names: string[] | undefined): string {
  return (names ?? []).map(n => n.trim().split(' ')[0]).filter(Boolean).join(' & ')
}
