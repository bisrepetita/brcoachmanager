import { NextRequest, NextResponse } from 'next/server'
import type { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'
import { resolveAccessInfo } from '@/lib/server/building-admin'

// Route publique (pas d'auth requise) : détail d'une séance collective publique, avec uniquement
// les champs sûrs à exposer à un visiteur non connecté — jamais `enrollments` (cf. public-list).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const adminDb = getAdminDb()
    const snap = await adminDb.collection('groupSessions').doc(id).get()
    if (!snap.exists) return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })

    const d = snap.data()!
    if (d['isPublic'] !== true || d['status'] === 'cancelled') {
      return NextResponse.json({ error: 'Séance non disponible' }, { status: 404 })
    }

    const enrollments = (d['enrollments'] as Array<{ status: string }> | undefined) ?? []
    const confirmedCount = enrollments.filter((e) => e.status !== 'cancelled').length
    const { accessInstructions, photos } = await resolveAccessInfo(adminDb, d['locationId'] as string | undefined)

    return NextResponse.json({
      id: snap.id,
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
      accessInstructions,
      accessPhotos: photos,
    })
  } catch (err) {
    console.error('[group-sessions/public/[id]]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
