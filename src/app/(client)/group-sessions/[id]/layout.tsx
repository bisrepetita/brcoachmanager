import type { Metadata } from 'next'
import type { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import { pageMetadata } from '@/lib/site-metadata'

// Aperçu du lien d'une séance partagée (WhatsApp…) : « Round by Round · vendredi 16 octobre à
// 12:30 ». Seulement pour une séance publique non annulée — une séance de groupe privé garde un
// aperçu générique (son contenu ne doit pas fuiter hors du groupe).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  try {
    const { id } = await params
    const snap = await getAdminDb().collection('groupSessions').doc(id).get()
    const d = snap.data()
    if (!d || d['isPublic'] !== true || d['status'] === 'cancelled') return pageMetadata('Séance')

    const startAt = (d['startAt'] as Timestamp).toDate()
    // Le serveur tourne en UTC : date et heure formatées explicitement à l'heure suisse
    const when = new Intl.DateTimeFormat('fr-CH', {
      timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }).format(startAt).replace(/(?<!à) (\d{2}:\d{2})$/, ' à $1') // « à » absent selon la version d'ICU

    const coaches = ((d['coachNames'] as string[] | undefined) ?? []).map(n => n.trim().split(' ')[0]).filter(Boolean).join(' & ')
    const enrollments = (d['enrollments'] as Array<{ status: string }> | undefined) ?? []
    const spotsLeft = Math.max(0, (d['maxParticipants'] as number) - enrollments.filter(e => e.status !== 'cancelled').length)
    const price = d['price'] as number
    const details = [
      coaches && `Avec ${coaches}`,
      spotsLeft === 0 ? 'Complet' : `${spotsLeft} place${spotsLeft > 1 ? 's' : ''} restante${spotsLeft > 1 ? 's' : ''}`,
      price === 0 ? 'Gratuit' : `${Number.isInteger(price) ? price : price.toFixed(2)} CHF`,
    ].filter(Boolean).join(' · ')

    return pageMetadata(`${d['title'] as string} · ${when}`, `${details}. Réserve ta place sur l'app Bis Repetita.`)
  } catch {
    return pageMetadata('Séance')
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
