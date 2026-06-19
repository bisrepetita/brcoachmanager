import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'

export async function requestPaymentLink(
  sessionId: string,
  clientId: string
): Promise<string> {
  const auth = getAuth(firebaseApp)
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch('/api/create-payment-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionId, clientId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }))
    throw new Error((err as { error: string }).error)
  }

  const data = (await res.json()) as { link: string }
  return data.link
}
