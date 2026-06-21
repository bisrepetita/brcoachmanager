'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestNotificationPermission } from '@/lib/firebase/messaging'
import { useToast } from '@/components/ui/Toast'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore'

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

  // Demande de permission FCM
  useEffect(() => {
    if (!user?.id) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'denied') {
      requestNotificationPermission(user.id).catch(() => {})
    }
  }, [user?.id])

  // Écoute Firestore → toast in-app immédiat
  useEffect(() => {
    if (!user?.id) return
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
      where('shown', '==', false)
    )
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const d = change.doc.data()
        // Ignorer les docs créés il y a plus de 30s (au cas où on recharge la page)
        const age = Date.now() - (d.createdAt?.toMillis?.() ?? 0)
        if (age > 600000) return // ignorer si > 10 min
        showToast(d.title, d.body)
        updateDoc(doc(db, 'notifications', change.doc.id), { shown: true }).catch(() => {})
      })
    })
    return unsub
  }, [user?.id, showToast])

  return <>{children}</>
}
