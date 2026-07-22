import { NextRequest, NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'

// Le rôle client n'a aucun accès en lecture à `sessions` (ni à la vue complète de `groupSessions`
// d'autres clients), donc ce contrôle de chevauchement ne peut pas se faire depuis le navigateur
// avec les Firestore rules actuelles — il passe par cette route Admin SDK. Avertissement uniquement,
// ne bloque jamais l'inscription (décision produit).
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { groupSessionId } = (await req.json()) as { groupSessionId?: string }
  if (!groupSessionId) return NextResponse.json({ error: 'groupSessionId requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    if (clientSnap.empty) return NextResponse.json({ hasOverlap: false })
    const clientId = clientSnap.docs[0]!.id

    const targetSnap = await adminDb.collection('groupSessions').doc(groupSessionId).get()
    if (!targetSnap.exists) return NextResponse.json({ hasOverlap: false })
    const target = targetSnap.data()!
    const slotStart = (target['startAt'] as Timestamp).toDate().getTime()
    const slotEnd = (target['endAt'] as Timestamp).toDate().getTime()
    const windowStart = new Date(slotStart - 12 * 60 * 60 * 1000)
    const windowEnd = new Date(slotEnd)

    const overlaps = (sStart: number, sEnd: number) => sStart < slotEnd && sEnd > slotStart

    // Séances individuelles où le client est inscrit
    const sessionsSnap = await adminDb.collection('sessions')
      .where('clientIds', 'array-contains', clientId)
      .where('startAt', '>=', Timestamp.fromDate(windowStart))
      .where('startAt', '<', Timestamp.fromDate(windowEnd))
      .get()

    const hasSessionOverlap = sessionsSnap.docs.some((d) => {
      const s = d.data()
      if (s['status'] === 'cancelled') return false
      const sStart = (s['startAt'] as Timestamp).toDate().getTime()
      const sEnd = (s['endAt'] as Timestamp).toDate().getTime()
      return overlaps(sStart, sEnd)
    })

    // Autres séances collectives où le client a une inscription active
    const groupSessionsSnap = await adminDb.collection('groupSessions')
      .where('startAt', '>=', Timestamp.fromDate(windowStart))
      .where('startAt', '<', Timestamp.fromDate(windowEnd))
      .get()

    const hasGroupSessionOverlap = groupSessionsSnap.docs.some((d) => {
      if (d.id === groupSessionId) return false
      const gs = d.data()
      if (gs['status'] === 'cancelled') return false
      const enrollments = (gs['enrollments'] as Record<string, unknown>[] | undefined) ?? []
      const isEnrolled = enrollments.some((e) => e['clientId'] === clientId && e['status'] !== 'cancelled')
      if (!isEnrolled) return false
      const sStart = (gs['startAt'] as Timestamp).toDate().getTime()
      const sEnd = (gs['endAt'] as Timestamp).toDate().getTime()
      return overlaps(sStart, sEnd)
    })

    return NextResponse.json({ hasOverlap: hasSessionOverlap || hasGroupSessionOverlap })
  } catch (err) {
    console.error('[group-sessions/check-overlap]', err)
    return NextResponse.json({ hasOverlap: false })
  }
}
