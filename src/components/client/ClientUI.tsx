import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// Briques visuelles du design client « Chaleureux monochrome » (cf. maquettes de l'accueil),
// partagées entre les pages de l'espace client.

export const C = {
  bg: '#F1F1F0', card: '#FAFAFA', soft: '#E6E6E5', ink: '#1C1C1C', muted: '#6E6E6B', line: '#E3E3E1',
  // Nuances intermédiaires pour éviter un rendu tout noir / tout blanc
  charcoal: '#2C2C2A', graphite: '#4A4A47', stone: '#DEDEDB',
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
export function DateBox({ date, dark, light }: { date: Date; dark?: boolean; light?: boolean }) {
  const big = dark || light
  const size = big ? { width: 64, height: 68, radius: 14, day: 26 } : { width: 46, height: 50, radius: 10, day: 19 }
  return (
    <div style={{
      width: size.width, height: size.height, borderRadius: size.radius, flexShrink: 0,
      background: light ? C.card : dark ? C.ink : C.soft, color: dark ? '#fff' : C.ink,
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

export const inputStyle: React.CSSProperties = {
  width: '100%', height: 52, borderRadius: 16, border: `1px solid ${C.line}`, background: C.card,
  padding: '0 18px', fontSize: 15, color: C.ink, outline: 'none', fontFamily: 'inherit',
}

/** Champ de formulaire avec libellé (pages connexion / inscription). */
export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', margin: '0 0 6px 4px', fontSize: 13, fontWeight: 500, color: C.muted }}>{label}</label>
      {children}
    </div>
  )
}

/** Logo Google officiel (bouton « Continuer avec Google »). */
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  )
}
