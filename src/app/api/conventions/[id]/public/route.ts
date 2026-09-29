import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'

// Route publique (pas d'auth requise) : détail d'une convention active, avec uniquement les
// champs nécessaires à l'affichage de la page de signature /convention/[id].
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const adminDb = getAdminDb()
    const snap = await adminDb.collection('conventions').doc(id).get()
    if (!snap.exists) return NextResponse.json({ error: 'Convention introuvable' }, { status: 404 })

    const d = snap.data()!
    if (d['status'] !== 'active') {
      return NextResponse.json({ error: 'Convention non disponible' }, { status: 404 })
    }

    return NextResponse.json({
      id: snap.id,
      title: d['title'],
      activityLabel: d['activityLabel'],
      dayTimeLabel: d['dayTimeLabel'],
      pricePerSession: d['pricePerSession'],
      groupSize: d['groupSize'],
      maxParticipants: d['maxParticipants'],
      version: d['version'],
      versionDate: d['versionDate'],
    })
  } catch (err) {
    console.error('[conventions/public/[id]]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
