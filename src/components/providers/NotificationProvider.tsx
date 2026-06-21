'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { requestNotificationPermission } from '@/lib/firebase/messaging'
import { useToast } from '@/components/ui/Toast'
import { db } from '@/lib/firebase/firestore'
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch } from 'firebase/firestore'

interface NotifContextValue {
  pendingCount: number
  markAllRead: () => void
}

const NotifContext = createContext<NotifContextValue>({ pendingCount: 0, markAllRead: () => {} })

export function useNotifCount() { return useContext(NotifContext) }

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [pendingIds, setPendingIds] = useState<string[]>([])

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

  // Écoute Firestore → toast temps réel + compteur de notifications en attente
  useEffect(() => {
    if (!user?.id) return
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.id),
      where('shown', '==', false)
    )
    const unsub = onSnapshot(q, (snap) => {
      const ids = snap.docs.map(d => d.id)
      setPendingIds(ids)

      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const d = change.doc.data()
        const age = Date.now() - (d.createdAt?.toMillis?.() ?? 0)
        // Toast seulement pour les notifications reçues en temps réel (< 10s)
        if (age > 10000) return
        showToast(d.title, d.body)
        updateDoc(doc(db, 'notifications', change.doc.id), { shown: true }).catch(() => {})
      })
    })
    return unsub
  }, [user?.id, showToast])

  function markAllRead() {
    if (!pendingIds.length) return
    const batch = writeBatch(db)
    pendingIds.forEach(id => batch.update(doc(db, 'notifications', id), { shown: true }))
    batch.commit().catch(() => {})
  }

  return (
    <NotifContext.Provider value={{ pendingCount: pendingIds.length, markAllRead }}>
      {children}
    </NotifContext.Provider>
  )
}
