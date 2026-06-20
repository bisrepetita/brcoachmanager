importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    if (!firebase.apps.length) {
      firebase.initializeApp(event.data.config)
    }
    const messaging = firebase.messaging()

    messaging.onBackgroundMessage((payload) => {
      const data = payload.data ?? {}
      const title = data.title ?? payload.notification?.title ?? 'BRCoachManager'
      const body = data.body ?? payload.notification?.body ?? ''
      const link = data.link ?? '/'

      // Notifier les onglets ouverts pour afficher un toast
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        const focused = list.some(c => c.focused)
        list.forEach(c => c.postMessage({ type: 'FCM_TOAST', title, body }))
        // Notification système seulement si aucune fenêtre active
        if (!focused) {
          self.registration.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            data: { link },
          })
        }
      })
    })
  }
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
