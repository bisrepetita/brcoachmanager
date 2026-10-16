import { NextRequest, NextResponse } from 'next/server'
import type { Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase/admin'

// Fichier calendrier (.ics) d'une séance collective, pour le bouton « Ajouter au calendrier » de
// l'accueil client. Route sans auth : le lien est ouvert par une navigation (iOS/Android proposent
// alors d'ajouter l'événement), qui ne peut pas porter de token. N'expose que titre, horaires et
// lieu — pas les inscrits ; refusé pour une séance annulée.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const adminDb = getAdminDb()
    const snap = await adminDb.collection('groupSessions').doc(id).get()
    if (!snap.exists || snap.data()!['status'] === 'cancelled') {
      return NextResponse.json({ error: 'Séance introuvable' }, { status: 404 })
    }
    const d = snap.data()!

    const locationId = d['locationId'] as string | undefined
    const location = locationId ? (await adminDb.collection('locations').doc(locationId).get()).data() : undefined
    const place = (location?.['address'] as string | undefined) || (location?.['name'] as string | undefined) || ''
    const coaches = ((d['coachNames'] as string[] | undefined) ?? []).join(', ')
    const url = `${req.nextUrl.origin}/group-sessions/${id}`

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Bis Repetita//BRCoachManager//FR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${id}@bisrepetita.ch`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate((d['startAt'] as Timestamp).toDate())}`,
      `DTEND:${icsDate((d['endAt'] as Timestamp).toDate())}`,
      `SUMMARY:${icsText(`${d['title'] as string} — Bis Repetita`)}`,
      ...(place ? [`LOCATION:${icsText(place)}`] : []),
      `DESCRIPTION:${icsText([coaches && `Avec ${coaches}`, url].filter(Boolean).join('\n'))}`,
      `URL:${url}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(d['title'] as string)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')

    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="seance-${id}.ics"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[group-sessions/calendar]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
}
