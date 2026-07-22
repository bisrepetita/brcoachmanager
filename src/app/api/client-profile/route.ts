import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const { uid } = await getAdminAuth().verifyIdToken(token)
    const adminDb = getAdminDb()

    const snap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (snap.empty) return NextResponse.json({ error: 'Fiche client introuvable' }, { status: 404 })

    const doc = snap.docs[0]!
    const data = doc.data()

    return NextResponse.json({
      clientId: doc.id,
      firstName: data['firstName'] as string,
      lastName: data['lastName'] as string,
      email: data['email'] as string | undefined,
      phone: data['phone'] as string | undefined,
      sessionCredits: data['sessionCredits'] as number,
      hasEverBooked: data['hasEverBooked'] === true,
    })
  } catch (err) {
    console.error('[client-profile]', err)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
