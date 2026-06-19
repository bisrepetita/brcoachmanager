import {
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import {
  sendPasswordResetEmail,
} from 'firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import type { UserRole } from '@/types'

export interface CreateCoachInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  roles: UserRole[]
  color: string
  isIndependent?: boolean
}

export interface UpdateCoachInput extends Partial<Omit<CreateCoachInput, 'email'>> {
  active?: boolean
}

export async function createCoach(input: CreateCoachInput): Promise<string> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch('/api/create-coach', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Erreur création coach')

  // Envoie l'email de reset depuis le client (ne déconnecte pas l'admin)
  await sendPasswordResetEmail(auth, input.email)

  return data.uid as string
}

export async function updateCoach(uid: string, input: UpdateCoachInput): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...input,
    updatedAt: serverTimestamp(),
  })
}

export async function toggleCoachActive(uid: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    active,
    updatedAt: serverTimestamp(),
  })
}
