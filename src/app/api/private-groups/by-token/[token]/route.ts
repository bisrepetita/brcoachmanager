import { NextRequest, NextResponse } from 'next/server'
import type { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import { findActivePrivateGroupByToken, optionalUid, memberRef, toPrivateSessionView } from '@/lib/server/private-group-admin'

// Route publique (auth optionnelle) : page /groupe/{token}. Le token est le seul secret — un
// visiteur anonyme voit le nom du groupe et ses séances à venir (vue réduite), un client connecté
// voit en plus s'il est membre et ses propres inscriptions.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const adminDb = getAdminDb()
    const groupDoc = await findActivePrivateGroupByToken(adminDb, token)
    if (!groupDoc) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })

    let clientId: string | undefined
    let isMember = false
    const uid = await optionalUid(req.headers.get('authorization'))
    if (uid) {
      const [clientSnap, memberSnap] = await Promise.all([
        adminDb.collection('clients').where('uid', '==', uid).limit(1).get(),
        memberRef(adminDb, groupDoc.id, uid).get(),
      ])
      clientId = clientSnap.docs[0]?.id
      isMember = memberSnap.exists
    }

    // Filtrage statut/date en mémoire : peu de séances par groupe, et ça évite un index composite.
    const now = Date.now()
    const sessionsSnap = await adminDb.collection('groupSessions').where('privateGroupId', '==', groupDoc.id).get()
    const sessions = sessionsSnap.docs
      .filter((d) => d.data()['status'] === 'planned' && (d.data()['startAt'] as Timestamp).toMillis() >= now)
      .sort((a, b) => (a.data()['startAt'] as Timestamp).toMillis() - (b.data()['startAt'] as Timestamp).toMillis())
      .map((d) => toPrivateSessionView(d.id, d.data(), clientId))

    return NextResponse.json({
      group: { id: groupDoc.id, name: groupDoc.data()['name'] as string },
      isMember,
      hasClientProfile: !!clientId,
      sessions,
    })
  } catch (err) {
    console.error('[private-groups/by-token]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
