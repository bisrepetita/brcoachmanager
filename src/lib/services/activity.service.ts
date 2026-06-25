import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/firestore'

export type ActivityAction =
  | 'session_created'
  | 'session_edited'
  | 'session_cancelled'
  | 'session_deleted'
  | 'session_done'
  | 'payment_updated'
  | 'client_created'
  | 'client_edited'
  | 'client_deleted'

export async function logActivity(params: {
  userId: string
  userFirstName: string
  userLastName: string
  action: ActivityAction
  description: string
  sessionId?: string
  clientId?: string
  meta?: Record<string, string>
}): Promise<void> {
  try {
    await addDoc(collection(db, 'activityLogs'), {
      ...params,
      createdAt: serverTimestamp(),
    })
  } catch {
    // Non critique
  }
}
