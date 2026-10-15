import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { findReferrerByCode } from '@/lib/server/referral-admin'

// Route publique : prénom du parrain pour la page d'invitation /parrainage/[code] — rien d'autre.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const referrer = await findReferrerByCode(getAdminDb(), code)
    if (!referrer) return NextResponse.json({ error: 'Lien de parrainage inconnu' }, { status: 404 })
    return NextResponse.json({ firstName: referrer.data()['firstName'] as string })
  } catch (err) {
    console.error('[referral/code]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
