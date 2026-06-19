'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestNotificationPermission, onForegroundMessage } from '@/lib/firebase/messaging'

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  // Enregistrement du service worker FCM
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/firebase-messaging-sw.js').then(reg => {
      // Passer la config Firebase au SW pour qu'il puisse initialiser firebase
      const config = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      }
      reg.active?.postMessage({ type: 'FIREBASE_CONFIG', config })
      reg.installing?.addEventListener('statechange', (e) => {
        if ((e.target as ServiceWorker).state === 'activated') {
          reg.active?.postMessage({ type: 'FIREBASE_CONFIG', config })
        }
      })
    }).catch(() => {})
  }, [])

  // Demande de permission + enregistrement du token quand l'utilisateur est connecté
  useEffect(() => {
    if (!user?.id) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'granted') {
      requestNotificationPermission(user.id).catch(() => {})
    } else if (Notification.permission === 'default') {
      // On demande seulement si jamais refusé
      requestNotificationPermission(user.id).catch(() => {})
    }
  }, [user?.id])

  // Notifications en foreground → toast natif
  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      const title = payload.notification?.title ?? 'BRCoachManager'
      const body = payload.notification?.body ?? ''
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icons/icon-192.png' })
      }
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [])

  return <>{children}</>
}
