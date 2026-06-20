import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { getMessaging } from 'firebase-admin/messaging'
import { getAdminApp } from '@/lib/firebase/admin'

export async function POST(req: NextRequest) {
  try {
    const { userIds, title, body, link } = await req.json() as {
      userIds: string[]
      title: string
      body: string
      link?: string
    }

    if (!userIds?.length || !title || !body) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = getAdminDb()

    const tokens: string[] = []
    for (const uid of userIds) {
      const snap = await db.collection('users').doc(uid).get()
      const token = snap.data()?.fcmToken
      if (token && typeof token === 'string') tokens.push(token)
    }

    if (tokens.length === 0) {
      return NextResponse.json({ sent: 0 })
    }

    const messaging = getMessaging(getAdminApp())

    // Data-only message : onMessage se déclenche en foreground (toast),
    // onBackgroundMessage dans le SW se déclenche en background (notif système)
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: { title, body, link: link ?? '/' },
      webpush: { headers: { Urgency: 'high' } },
    })

    return NextResponse.json({ sent: response.successCount, failed: response.failureCount })
  } catch (err) {
    console.error('[send-notification]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
