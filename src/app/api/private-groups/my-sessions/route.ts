import { NextRequest, NextResponse } from 'next/server'
import type { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { findMemberPrivateGroupIds, toPrivateSessionView } from '@/lib/server/private-group-admin'

// Séances (planifiées ou passées) des groupes privés dont le client connecté est membre — vue
// réduite, avec uniquement sa propre inscription. Alimente le Planning et "Mes inscriptions" côté
// client : les règles Firestore ne permettent pas une requête de liste sur ces séances.
export async function GET(req: NextRequest) {
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
    const [clientSnap, groupIds] = await Promise.all([
      adminDb.collection('clients').where('uid', '==', uid).limit(1).get(),
      findMemberPrivateGroupIds(adminDb, uid),
    ])
    const clientId = clientSnap.docs[0]?.id
    if (!clientId || groupIds.length === 0) return NextResponse.json({ items: [] })

    const snaps = await Promise.all(groupIds.map((gid) =>
      adminDb.collection('groupSessions').where('privateGroupId', '==', gid).get()))
    const items = snaps
      .flatMap((s) => s.docs)
      .filter((d) => ['planned', 'done'].includes(d.data()['status'] as string))
      .sort((a, b) => (a.data()['startAt'] as Timestamp).toMillis() - (b.data()['startAt'] as Timestamp).toMillis())
      .map((d) => toPrivateSessionView(d.id, d.data(), clientId))

    return NextResponse.json({ items })
  } catch (err) {
    console.error('[private-groups/my-sessions]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
