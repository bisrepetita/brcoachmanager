import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { db } from '@/lib/firebase/firestore'
import { auth } from '@/lib/firebase/auth'
import type { User, UserRole } from '@/types'

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
  // Crée le compte Firebase Auth avec un mot de passe temporaire
  const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'
  const cred = await createUserWithEmailAndPassword(auth, input.email, tempPassword)
  const uid = cred.user.uid

  // Crée le document Firestore
  await setDoc(doc(db, 'users', uid), {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone ?? '',
    roles: input.roles,
    active: true,
    color: input.color,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // Envoie un email de réinitialisation du mot de passe
  await sendPasswordResetEmail(auth, input.email)

  return uid
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
