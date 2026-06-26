import { getAuth } from 'firebase/auth'
import { firebaseApp } from '@/lib/firebase/config'

async function callPaymentLinkApi(body: Record<string, string>): Promise<string> {
  const auth = getAuth(firebaseApp)
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Non authentifié')

  const res = await fetch('/api/create-payment-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `HTTP ${res.status}`
    try { message = (JSON.parse(text) as { error: string }).error ?? message } catch { message = text || message }
    throw new Error(message)
  }

  return ((await res.json()) as { link: string }).link
}

export function requestPaymentLink(sessionId: string, clientId: string): Promise<string> {
  return callPaymentLinkApi({ sessionId, clientId })
}

export function requestSalePaymentLink(saleId: string, clientId: string): Promise<string> {
  return callPaymentLinkApi({ saleId, clientId })
}
