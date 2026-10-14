import type { DocumentData, Firestore, Timestamp, Transaction } from 'firebase-admin/firestore'
import { getAdminAuth } from '@/lib/firebase/admin'
import type { PrivateSessionView } from '@/types'

export function memberRef(adminDb: Firestore, privateGroupId: string, uid: string) {
  return adminDb.collection('privateGroups').doc(privateGroupId).collection('members').doc(uid)
}

export async function isPrivateGroupMemberInTransaction(tx: Transaction, adminDb: Firestore, privateGroupId: string, uid: string): Promise<boolean> {
  return (await tx.get(memberRef(adminDb, privateGroupId, uid))).exists
}

export async function findActivePrivateGroupByToken(adminDb: Firestore, token: string) {
  if (!token) return null
  const snap = await adminDb.collection('privateGroups').where('token', '==', token).limit(1).get()
  const groupDoc = snap.docs[0]
  if (!groupDoc || groupDoc.data()['active'] !== true) return null
  return groupDoc
}

/** uid du token Bearer s'il est présent et valide, sinon null (routes accessibles aussi en anonyme). */
export async function optionalUid(authorization: string | null): Promise<string | null> {
  const token = authorization?.replace('Bearer ', '')
  if (!token) return null
  try {
    return (await getAdminAuth().verifyIdToken(token)).uid
  } catch {
    return null
  }
}

// Vue réduite d'une séance de groupe privé — jamais `enrollments` (détail des paiements de chaque
// participant), seulement le nombre de places prises et l'éventuelle inscription du client courant.
export function toPrivateSessionView(id: string, d: DocumentData, clientId?: string): PrivateSessionView {
  const enrollments = (d['enrollments'] as Array<{ status: string; clientId?: string }> | undefined) ?? []
  const mine = clientId ? enrollments.find((e) => e.clientId === clientId && e.status !== 'cancelled') : undefined
  return {
    id,
    title: d['title'],
    description: d['description'],
    coachNames: d['coachNames'],
    startAt: (d['startAt'] as Timestamp).toDate().toISOString(),
    endAt: (d['endAt'] as Timestamp).toDate().toISOString(),
    maxParticipants: d['maxParticipants'],
    price: d['price'],
    level: d['level'],
    privateGroupName: d['privateGroupName'],
    confirmedCount: enrollments.filter((e) => e.status !== 'cancelled').length,
    ...(mine ? { myStatus: mine.status } : {}),
  }
}
