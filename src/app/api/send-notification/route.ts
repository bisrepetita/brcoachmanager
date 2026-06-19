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

    // Récupérer les tokens FCM des utilisateurs ciblés
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

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: link ? { link } : {},
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
        },
        fcmOptions: link ? { link } : {},
      },
    })

    return NextResponse.json({ sent: response.successCount, failed: response.failureCount })
  } catch (err) {
    console.error('[send-notification]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
