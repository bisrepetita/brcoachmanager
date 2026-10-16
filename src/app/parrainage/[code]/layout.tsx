import type { Metadata } from 'next'
import { getAdminDb } from '@/lib/firebase/admin'
import { findReferrerByCode } from '@/lib/server/referral-admin'
import { pageMetadata } from '@/lib/site-metadata'

// Aperçu du lien de parrainage partagé par un client : « Paul t'invite chez Bis Repetita ».
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const description = 'Ta première séance est offerte. Crée ton compte en une minute pour réserver.'
  try {
    const { code } = await params
    const referrer = await findReferrerByCode(getAdminDb(), code)
    const firstName = referrer?.data()['firstName'] as string | undefined
    return pageMetadata(firstName ? `${firstName} t'invite` : 'Invitation', description)
  } catch {
    return pageMetadata('Invitation', description)
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
