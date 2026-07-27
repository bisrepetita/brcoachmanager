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

    // `services` n'est pas lisible par un visiteur anonyme (règle isAuth()) — on résout l'image de
    // fond ici, côté serveur (Admin SDK, contourne les règles), pour le widget embed public.
    const serviceIds = [...new Set(snap.docs.map((doc) => doc.data()['serviceId'] as string | undefined).filter((id): id is string => !!id))]
    const serviceSnaps = await Promise.all(serviceIds.map((id) => adminDb.collection('services').doc(id).get()))
    const serviceImageMap = new Map(serviceSnaps.filter((s) => s.exists).map((s) => [s.id, s.data()?.['imageUrl'] as string | undefined]))

    const items = snap.docs.map((doc) => {
      const d = doc.data()
      const enrollments = (d['enrollments'] as Array<{ status: string }> | undefined) ?? []
      const confirmedCount = enrollments.filter((e) => e.status !== 'cancelled').length
      const serviceId = d['serviceId'] as string | undefined
      return {
        id: doc.id,
        title: d['title'],
        description: d['description'],
        coachNames: d['coachNames'],
        locationId: d['locationId'],
        serviceId,
        imageUrl: serviceId ? serviceImageMap.get(serviceId) : undefined,
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
