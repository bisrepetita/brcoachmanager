'use client'

import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'
import { doc, updateDoc } from 'firebase/firestore'
import { firebaseApp } from './config'
import { db } from './firestore'

let _messaging: Messaging | null = null

export function getMessagingInstance(): Messaging | null {
  if (typeof window === 'undefined') return null
  if (_messaging) return _messaging
  try {
    _messaging = getMessaging(firebaseApp)
    return _messaging
  } catch {
    return null
  }
}

export async function requestNotificationPermission(userId: string): Promise<string | null> {
  const messaging = getMessagingInstance()
  if (!messaging) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
  if (!vapidKey) return null

  try {
    const reg = await navigator.serviceWorker.ready
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg })
    if (token) {
      await updateDoc(doc(db, 'users', userId), { fcmToken: token })
    }
    return token
  } catch {
    return null
  }
}

export function onForegroundMessage(
  callback: (payload: { notification?: { title?: string; body?: string } }) => void
) {
  const messaging = getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}
