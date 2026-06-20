import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase/admin'
import { getMessaging } from 'firebase-admin/messaging'
import { getAdminApp } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

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

    // Écrire dans Firestore pour le toast in-app (temps réel)
    await Promise.all(userIds.map(uid =>
      db.collection('notifications').add({
        userId: uid,
        title,
        body,
        link: link ?? '/',
        shown: false,
        createdAt: FieldValue.serverTimestamp(),
      })
    ))

    // FCM pour la notif système quand l'app est fermée
    const tokens: string[] = []
    for (const uid of userIds) {
      const snap = await db.collection('users').doc(uid).get()
      const token = snap.data()?.fcmToken
      if (token && typeof token === 'string') tokens.push(token)
    }

    let sent = 0
    if (tokens.length > 0) {
      const messaging = getMessaging(getAdminApp())
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        webpush: {
          notification: { icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' },
          fcmOptions: link ? { link } : {},
        },
      })
      sent = response.successCount
    }

    return NextResponse.json({ sent })
  } catch (err) {
    console.error('[send-notification]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
