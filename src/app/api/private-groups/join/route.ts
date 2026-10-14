import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb, getAdminAuth } from '@/lib/firebase/admin'
import { findActivePrivateGroupByToken, memberRef } from '@/lib/server/private-group-admin'

// Un client connecté qui ouvre le lien /groupe/{token} devient membre du groupe — il voit ensuite
// les séances du groupe dans son planning sans avoir besoin du lien. Idempotent.
export async function POST(req: NextRequest) {
  const authToken = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!authToken) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let uid: string
  try {
    uid = (await getAdminAuth().verifyIdToken(authToken)).uid
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { token } = (await req.json()) as { token?: string }
  if (!token) return NextResponse.json({ error: 'token requis' }, { status: 400 })

  try {
    const adminDb = getAdminDb()
    const groupDoc = await findActivePrivateGroupByToken(adminDb, token)
    if (!groupDoc) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 })

    const clientSnap = await adminDb.collection('clients').where('uid', '==', uid).limit(1).get()
    const clientDoc = clientSnap.docs[0]
    if (!clientDoc) return NextResponse.json({ error: 'Compte non lié à une fiche client' }, { status: 412 })

    const ref = memberRef(adminDb, groupDoc.id, uid)
    const existing = await ref.get()
    if (existing.exists) return NextResponse.json({ ok: true, alreadyMember: true })

    const client = clientDoc.data()
    await ref.set({
      clientId: clientDoc.id,
      firstName: client['firstName'] ?? '',
      lastName: client['lastName'] ?? '',
      email: client['email'] ?? '',
      joinedAt: FieldValue.serverTimestamp(),
    })
    await adminDb.collection('activityLogs').add({
      userId: uid,
      userFirstName: client['firstName'] ?? '',
      userLastName: client['lastName'] ?? '',
      action: 'private_group_joined',
      description: `${client['firstName'] ?? ''} ${client['lastName'] ?? ''} a rejoint le groupe privé "${groupDoc.data()['name']}"`,
      clientId: clientDoc.id,
      createdAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ ok: true, alreadyMember: false })
  } catch (err) {
    console.error('[private-groups/join]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
