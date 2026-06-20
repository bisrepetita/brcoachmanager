importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

// Intercepte le push AVANT Firebase pour envoyer un postMessage à la page (toast)
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch {}

  const notif = data.notification ?? {}
  const custom = data.data ?? {}
  const title = notif.title ?? custom.title ?? 'BRCoachManager'
  const body = notif.body ?? custom.body ?? ''
  const link = custom.link ?? data.fcmOptions?.link ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Envoie le toast à toutes les fenêtres ouvertes
      list.forEach((c) => c.postMessage({ type: 'FCM_TOAST', title, body }))

      // Notification système seulement si aucune fenêtre visible
      const hasVisible = list.some((c) => c.visibilityState === 'visible')
      if (!hasVisible) {
        return self.registration.showNotification(title, {
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          data: { link },
        })
      }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = event.notification.data?.link ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(link)
          return
        }
      }
      return clients.openWindow(link)
    })
  )
})

// Firebase compat gardé pour l'initialisation du token FCM
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    if (!firebase.apps.length) firebase.initializeApp(event.data.config)
    firebase.messaging()
  }
})
