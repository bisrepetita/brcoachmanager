import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pad(n: number) { return String(n).padStart(2, '0') }

function toIcalDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params
  const secret = req.nextUrl.searchParams.get('secret') ?? ''

  const db = getAdminDb()
  const coachSnap = await db.collection('users').doc(coachId).get()
  if (!coachSnap.exists) return new NextResponse('Not found', { status: 404 })

  const coach = coachSnap.data() as { firstName: string; lastName: string; icalSecret?: string }
  if (!coach.icalSecret || coach.icalSecret !== secret) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Sessions futures + passées des 3 derniers mois
  const since = new Date()
  since.setMonth(since.getMonth() - 3)
  const { Timestamp } = await import('firebase-admin/firestore')

  const snap = await db.collection('sessions')
    .where('coachIds', 'array-contains', coachId)
    .where('status', '!=', 'cancelled')
    .where('startAt', '>=', Timestamp.fromDate(since))
    .get()

  const [locationsSnap, servicesSnap] = await Promise.all([
    db.collection('locations').get(),
    db.collection('services').get(),
  ])
  const locations = Object.fromEntries(locationsSnap.docs.map(d => [d.id, (d.data() as { name: string }).name]))
  const services = Object.fromEntries(servicesSnap.docs.map(d => [d.id, (d.data() as { name: string }).name]))

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BRCoachManager//FR',
    `X-WR-CALNAME:BRCoach - ${coach.firstName} ${coach.lastName}`,
    'X-WR-CALDESC:Séances BRCoachManager',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const d of snap.docs) {
    const s = d.data() as {
      startAt: { toDate(): Date }; endAt: { toDate(): Date }
      serviceId: string; locationId: string
      priceSnapshot?: { serviceName?: string }
    }
    const start = s.startAt.toDate()
    const end = s.endAt.toDate()
    const serviceName = services[s.serviceId] ?? s.priceSnapshot?.serviceName ?? 'Séance'
    const locationName = locations[s.locationId] ?? ''

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${d.id}@brcoachmanager`)
    lines.push(`DTSTART:${toIcalDate(start)}`)
    lines.push(`DTEND:${toIcalDate(end)}`)
    lines.push(`SUMMARY:${escapeIcal(serviceName)}`)
    if (locationName) lines.push(`LOCATION:${escapeIcal(locationName)}`)
    lines.push(`DTSTAMP:${toIcalDate(new Date())}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="brcoach-${coachId}.ics"`,
      'Cache-Control': 'no-cache',
    },
  })
}
