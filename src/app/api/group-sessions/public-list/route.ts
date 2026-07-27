import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'

// Route publique (pas d'auth requise) : liste des séances collectives publiques à venir, avec
// uniquement les champs sûrs à exposer à un visiteur non connecté — jamais `enrollments` (contient
// le détail des paiements de chaque client), remplacé par un simple compteur de places prises.
export async function GET() {
  try {
    const adminDb = getAdminDb()
    const snap = await adminDb.collection('groupSessions')
      .where('isPublic', '==', true)
      .where('status', '==', 'planned')
      .where('startAt', '>=', Timestamp.now())
      .orderBy('startAt', 'asc')
      .get()

    const items = snap.docs.map((doc) => {
      const d = doc.data()
      const enrollments = (d['enrollments'] as Array<{ status: string }> | undefined) ?? []
      const confirmedCount = enrollments.filter((e) => e.status !== 'cancelled').length
      return {
        id: doc.id,
        title: d['title'],
        description: d['description'],
        coachNames: d['coachNames'],
        locationId: d['locationId'],
        serviceId: d['serviceId'],
        startAt: (d['startAt'] as Timestamp).toDate().toISOString(),
        endAt: (d['endAt'] as Timestamp).toDate().toISOString(),
        maxParticipants: d['maxParticipants'],
        price: d['price'],
        level: d['level'],
        confirmedCount,
      }
    })

    return NextResponse.json({ items })
  } catch (err) {
    console.error('[group-sessions/public-list]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
