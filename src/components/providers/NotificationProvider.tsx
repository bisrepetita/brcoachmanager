'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestNotificationPermission, onForegroundMessage } from '@/lib/firebase/messaging'
import { useToast } from '@/components/ui/Toast'

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Enregistrement du service worker FCM
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/firebase-messaging-sw.js').then(reg => {
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
      requestNotificationPermission(user.id).catch(() => {})
    }
  }, [user?.id])

  // Notifications en foreground → toast in-app
  useEffect(() => {
    const unsub = onForegroundMessage((payload) => {
      // Les messages sont data-only : lire payload.data
      const data = payload.data as Record<string, string> | undefined
      const title = data?.title ?? payload.notification?.title ?? 'BRCoachManager'
      const body = data?.body ?? payload.notification?.body
      showToast(title, body)
    })
    return () => { if (typeof unsub === 'function') unsub() }
  }, [showToast])

  return <>{children}</>
}
