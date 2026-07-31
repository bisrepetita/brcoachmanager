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
  | 'credit_added'
  | 'credit_used'
  | 'client_signup'
  | 'client_signup_ambiguous_match'
  | 'group_session_cancelled_after_payment'
  | 'group_session_classpass_import'
  | 'group_session_classpass_unmatched'
  | 'group_session_classpass_error'
  | 'group_session_client_added_by_coach'

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
