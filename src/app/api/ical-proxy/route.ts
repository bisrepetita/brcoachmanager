import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface ExternalEvent {
  uid: string
  title: string
  start: string // ISO string
  end: string   // ISO string
}

function parseIcalDate(val: string): string | null {
  // Format: 20260620T090000Z  or  20260620T090000  or  20260620
  const clean = val.trim()
  if (/^\d{8}T\d{6}Z$/.test(clean)) {
    // UTC
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8)
    const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15)
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`).toISOString()
  }
  if (/^\d{8}T\d{6}$/.test(clean)) {
    // Local (no timezone — treat as Europe/Zurich UTC+1/+2, approximate as UTC+1)
    const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8)
    const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15)
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+01:00`).toISOString()
  }
  if (/^\d{8}$/.test(clean)) {
    // All-day — skip
    return null
  }
  return null
}

function parseIcal(text: string): ExternalEvent[] {
  const events: ExternalEvent[] = []
  // Unfold lines (RFC 5545 line folding)
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const lines = unfolded.split(/\r?\n/)

  let inEvent = false
  let uid = '', title = '', start = '', end = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (line === 'BEGIN:VEVENT') { inEvent = true; uid = ''; title = ''; start = ''; end = ''; continue }
    if (line === 'END:VEVENT') {
      if (inEvent && start && end) {
        events.push({ uid: uid || Math.random().toString(36).slice(2), title: title || 'Événement', start, end })
      }
      inEvent = false; continue
    }
    if (!inEvent) continue

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).toUpperCase()
    const val = line.slice(colon + 1)

    if (key === 'UID') uid = val
    else if (key === 'SUMMARY') title = val.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
    else if (key.startsWith('DTSTART')) { const d = parseIcalDate(val); if (d) start = d }
    else if (key.startsWith('DTEND')) { const d = parseIcalDate(val); if (d) end = d }
  }

  return events
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  try {
    await getAdminAuth().verifyIdToken(token)
  } catch {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
  }

  const { url } = (await req.json()) as { url: string }
  if (!url) return NextResponse.json({ error: 'URL manquante' }, { status: 400 })

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BRCoachManager/1.0' } })
    if (!res.ok) return NextResponse.json({ error: `Impossible de récupérer le calendrier (${res.status})` }, { status: 502 })
    const text = await res.text()
    const events = parseIcal(text)
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
