// Service worker mínimo para que la app sea instalable.
// No intercepta pedidos ni cachea nada: los datos financieros nunca quedan
// guardados en la caché del dispositivo.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
