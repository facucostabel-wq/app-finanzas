// Service worker mínimo para que la app sea instalable.
// No intercepta pedidos ni cachea nada: los datos financieros nunca quedan
// guardados en la caché del dispositivo.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Notificaciones push de grupos. El contenido llega cifrado y solo lo puede leer este dispositivo.
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { texto: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.titulo || 'Finanzas', {
      body: d.texto || 'Hay novedades en tus grupos',
      icon: '/icons/icon-192.png',
      data: { url: d.url || '/grupos' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/grupos', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ('focus' in v) {
          if ('navigate' in v) v.navigate(url).catch(() => {})
          return v.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
