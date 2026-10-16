import type { Metadata } from 'next'

// Aperçus de lien (WhatsApp, iMessage, réseaux sociaux, Google) — un seul ton pour toute l'app.

export const SITE_NAME = 'Bis Repetita'

export const DEFAULT_DESCRIPTION = 'Consulte le planning et réserve tes séances chez Bis Repetita en quelques secondes.'

/** Adresse publique : domaine de prod, sinon l'URL du déploiement Vercel (preview), sinon local. */
export const SITE_URL = process.env.VERCEL_ENV === 'production'
  ? 'https://app.bisrepetita.ch'
  : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'

const OG_IMAGE = { url: '/og-image.png', width: 1200, height: 630, alt: 'Bis Repetita' }

/**
 * Métadonnées d'une page : titre affiché « Titre · Bis Repetita » (gabarit du layout racine) et
 * aperçu de lien cohérent (même image partout).
 */
export function pageMetadata(title: string, description: string = DEFAULT_DESCRIPTION): Metadata {
  return {
    title,
    description,
    openGraph: { title: `${title} · ${SITE_NAME}`, description, siteName: SITE_NAME, locale: 'fr_CH', type: 'website', images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description, images: [OG_IMAGE.url] },
  }
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} · Réserve ta séance`, template: `%s · ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    title: `${SITE_NAME} · Réserve ta séance`, description: DEFAULT_DESCRIPTION, siteName: SITE_NAME,
    locale: 'fr_CH', type: 'website', images: [OG_IMAGE],
  },
  twitter: { card: 'summary_large_image', title: `${SITE_NAME} · Réserve ta séance`, description: DEFAULT_DESCRIPTION, images: [OG_IMAGE.url] },
}
