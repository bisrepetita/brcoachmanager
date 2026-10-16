// Parrainage — partagé client/serveur. Un filleul (fiche avec referredByClientId) a droit à une
// séance offerte, quel que soit le service (collective ou individuelle), tant qu'il ne l'a pas
// utilisée. Elle passe avant abonnement, pack et "1ère réservation offerte" pour ne jamais être
// perdue au profit d'un crédit payé.

export const REFERRAL_FREE_LABEL = 'Séance offerte (parrainage)'

export function hasReferralFreeSession(client: { referredByClientId?: string; referralFreeSessionUsed?: boolean } | undefined): boolean {
  return !!client?.referredByClientId && client.referralFreeSessionUsed !== true
}

// Le code du lien de parrainage est gardé dans le navigateur entre la page /parrainage/[code] et
// la création du compte (qui peut passer par une redirection Google).
const STORAGE_KEY = 'br_referral_code'

export function storeReferralCode(code: string): void {
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* stockage indisponible */ }
}

export function readReferralCode(): string | undefined {
  try { return localStorage.getItem(STORAGE_KEY) ?? undefined } catch { return undefined }
}

export function clearReferralCode(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* stockage indisponible */ }
}
