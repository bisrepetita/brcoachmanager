import { randomInt } from 'crypto'
import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sans 0/O ni 1/I, lisible à voix haute
const CODE_LENGTH = 6

/** Code de parrainage du client, généré et enregistré à la première demande. */
export async function getOrCreateReferralCode(adminDb: Firestore, clientId: string): Promise<string> {
  const ref = adminDb.collection('clients').doc(clientId)
  const existing = (await ref.get()).data()?.['referralCode'] as string | undefined
  if (existing) return existing

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
    const taken = await adminDb.collection('clients').where('referralCode', '==', code).limit(1).get()
    if (!taken.empty) continue
    await ref.update({ referralCode: code, updatedAt: FieldValue.serverTimestamp() })
    return code
  }
  throw new Error('Impossible de générer un code de parrainage')
}

export async function findReferrerByCode(adminDb: Firestore, code: string) {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return null
  const snap = await adminDb.collection('clients').where('referralCode', '==', normalized).limit(1).get()
  return snap.docs[0] ?? null
}

/**
 * Rattache un nouveau compte à son parrain. Ignoré (sans erreur : le compte doit se créer quand
 * même) si le code est inconnu, si c'est le propre code du client, ou si la fiche a déjà réservé
 * ou déjà un parrain — le parrainage ne vaut que pour un nouveau client.
 */
export async function applyReferralOnSignup(adminDb: Firestore, clientId: string, code: string | undefined): Promise<boolean> {
  if (!code) return false
  const referrer = await findReferrerByCode(adminDb, code)
  if (!referrer || referrer.id === clientId) return false

  const clientRef = adminDb.collection('clients').doc(clientId)
  const client = (await clientRef.get()).data()
  if (!client || client['hasEverBooked'] === true || client['referredByClientId']) return false

  const r = referrer.data()
  await clientRef.update({
    referredByClientId: referrer.id,
    referredByName: `${r['firstName'] ?? ''} ${r['lastName'] ?? ''}`.trim(),
    referredAt: FieldValue.serverTimestamp(),
    referralFreeSessionUsed: false,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return true
}

/** Rend la séance offerte du parrainage si l'inscription annulée l'utilisait (écriture seule). */
export function restoreReferralFreeSessionInTransaction(
  tx: Transaction, adminDb: Firestore, entry: Record<string, unknown>,
): void {
  const clientId = entry['clientId']
  if (entry['referralFreeSession'] !== true || typeof clientId !== 'string') return
  tx.update(adminDb.collection('clients').doc(clientId), {
    referralFreeSessionUsed: false,
    updatedAt: FieldValue.serverTimestamp(),
  })
}
