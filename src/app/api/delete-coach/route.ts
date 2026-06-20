import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    const adminAuth = getAdminAuth()
    const decoded = await adminAuth.verifyIdToken(token)
    const adminDb = getAdminDb()
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get()
    const roles: string[] = (callerSnap.data() as { roles?: string[] })?.roles ?? []
    if (!roles.includes('admin')) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
    }

    const { coachId } = (await req.json()) as { coachId: string }
    if (!coachId) return NextResponse.json({ error: 'coachId manquant' }, { status: 400 })

    // Récupère l'email pour trouver le compte Auth
    const coachSnap = await adminDb.collection('users').doc(coachId).get()
    if (!coachSnap.exists) return NextResponse.json({ error: 'Coach introuvable' }, { status: 404 })

    const email = (coachSnap.data() as { email?: string })?.email
    if (email) {
      try {
        const userRecord = await adminAuth.getUserByEmail(email)
        await adminAuth.deleteUser(userRecord.uid)
      } catch {
        // Si l'utilisateur Auth n'existe pas, on continue quand même
      }
    }

    await adminDb.collection('users').doc(coachId).delete()

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[delete-coach]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
