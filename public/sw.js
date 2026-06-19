const CACHE = 'br-coach-v1'
const OFFLINE_URL = '/offline'

// Assets Next.js immuables (hachés) — cache-first à vie
const IMMUTABLE_PATTERN = /\/_next\/static\//

// À l'installation : précache la page offline et la racine
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([OFFLINE_URL, '/'])).then(() => self.skipWaiting())
  )
})

// À l'activation : supprimer les anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Ne pas intercepter les requêtes non-GET, API, FCM, ou cross-origin
  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (!url.origin.includes(self.location.hostname)) return

  // Assets Next.js immuables → cache-first (ne changent jamais)
  if (IMMUTABLE_PATTERN.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Navigation HTML → network-first, fallback offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(request, clone))
          }
          return res
        })
        .catch(() => caches.match(request).then(cached => cached ?? caches.match(OFFLINE_URL)))
    )
    return
  }

  // Autres assets (images, fonts…) → stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(request, res.clone()))
        return res
      }).catch(() => cached)
      return cached ?? network
    })
  )
})
