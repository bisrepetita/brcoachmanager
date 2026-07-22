const CACHE = 'br-coach-v2'
const OFFLINE_URL = '/offline'
const IMMUTABLE_PATTERN = /\/_next\/static\//

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([OFFLINE_URL, '/'])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function safePutInCache(request, response) {
  if (!response || !response.ok) return
  try {
    const clone = response.clone()
    caches.open(CACHE).then(c => c.put(request, clone)).catch(() => {})
  } catch {}
}

// Requêtes internes du routeur Next.js (App Router) : transitions client-side (clic sur un
// <Link>, redirection après une action) qui vont chercher les données de la page suivante sans
// navigation complète du navigateur (donc request.mode !== 'navigate'). Sans cette exclusion,
// elles tombaient dans le cache "stale-while-revalidate" ci-dessous et resservaient la version
// de la page vue lors d'une précédente visite — d'où des créneaux qui n'apparaissaient qu'après
// un rechargement forcé (Ctrl+Maj+R, qui contourne le service worker).
function isNextRouterRequest(request) {
  const h = request.headers
  return h.has('rsc') || h.has('next-router-prefetch') || h.has('next-router-state-tree') || h.has('next-url')
}

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname === '/manifest.json') return  // géré par le navigateur directement
  if (url.pathname.startsWith('/_vercel/')) return  // protection Vercel
  if (url.origin !== self.location.origin) return
  if (isNextRouterRequest(request)) return  // toujours réseau, jamais de cache

  // Assets Next.js immuables → cache-first
  if (IMMUTABLE_PATTERN.test(url.pathname)) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          safePutInCache(request, res)
          return res
        })
      })
    )
    return
  }

  // Navigation HTML → network-first, fallback cache puis offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          safePutInCache(request, res)
          return res
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached ?? caches.match(OFFLINE_URL)
          )
        )
    )
    return
  }

  // Autres assets → stale-while-revalidate
  e.respondWith(
    caches.match(request).then(cached => {
      const networkFetch = fetch(request)
        .then(res => {
          safePutInCache(request, res)
          return res
        })
        .catch(() => cached ?? new Response('', { status: 503 }))

      return cached ?? networkFetch
    })
  )
})
