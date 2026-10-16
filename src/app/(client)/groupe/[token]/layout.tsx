import type { Metadata } from 'next'
import { getAdminDb } from '@/lib/firebase/admin'
import { findActivePrivateGroupByToken } from '@/lib/server/private-group-admin'
import { pageMetadata } from '@/lib/site-metadata'

// Aperçu du lien d'un groupe privé (envoyé par la société à ses employés) : « Séances Acme ».
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const description = 'Inscris-toi aux séances réservées à ton groupe chez Bis Repetita.'
  try {
    const { token } = await params
    const group = await findActivePrivateGroupByToken(getAdminDb(), token)
    const name = group?.data()['name'] as string | undefined
    return pageMetadata(name ? `Séances ${name}` : 'Séances de groupe', description)
  } catch {
    return pageMetadata('Séances de groupe', description)
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
