importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    if (!firebase.apps.length) {
      firebase.initializeApp(event.data.config)
    }
    const messaging = firebase.messaging()

    // Data-only messages en background : affichage manuel
    messaging.onBackgroundMessage((payload) => {
      const data = payload.data ?? {}
      const title = data.title ?? 'BRCoachManager'
      const body = data.body ?? ''
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { link: data.link ?? '/' },
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
