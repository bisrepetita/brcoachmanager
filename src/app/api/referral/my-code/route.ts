import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { getOrCreateReferralCode } from '@/lib/server/referral-admin'

// Code de parrainage du client connecté (créé à la première demande).
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  try {
    const adminDb = getAdminDb()
    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })
    const code = await getOrCreateReferralCode(adminDb, clientSnap.docs[0]!.id)
    return NextResponse.json({ code, url: `${req.nextUrl.origin}/parrainage/${code}` })
  } catch (err) {
    console.error('[referral/my-code]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
