// Edge Function "enviar-push": manda notificaciones Web Push (RFC 8291 + VAPID, RFC 8292).
//
// La llama la base de datos (función notificar(), con pg_net) cada vez que hay un
// aviso de grupo. No usa librerías: solo WebCrypto y fetch.
//
// No necesita autenticación ("Verify JWT" desactivado): para mandar un push hace
// falta la clave privada VAPID, que viaja en el pedido desde la base. Sin esa clave
// y sin las suscripciones (guardadas en la base, protegidas por RLS) no se le puede
// mandar nada a ningún usuario de la app.

type Suscripcion = { endpoint: string; p256dh: string; auth: string }
type Vapid = { publica: string; privada: string; contacto: string }
type Aviso = { titulo: string; texto: string; url: string }

const te = new TextEncoder()

export function b64urlADatos(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function datosAB64url(d: Uint8Array): string {
  let bin = ''
  for (const b of d) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let i = 0
  for (const p of partes) {
    out.set(p, i)
    i += p.length
  }
  return out
}

async function hmac(clave: Uint8Array, datos: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', clave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, datos))
}

/** Cifra el contenido para una suscripción (RFC 8291, "aes128gcm"). */
export async function cifrar(contenido: Uint8Array, p256dh: string, authSecreto: string): Promise<Uint8Array> {
  const uaPublica = b64urlADatos(p256dh)
  const auth = b64urlADatos(authSecreto)

  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  const uaClave = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const secretoEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaClave }, par.privateKey, 256))

  const prkClave = await hmac(auth, secretoEcdh)
  const infoClave = unir(te.encode('WebPush: info\0'), uaPublica, asPublica, new Uint8Array([1]))
  const ikm = await hmac(prkClave, infoClave)

  const sal = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(sal, ikm)
  const cek = (await hmac(prk, te.encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16)
  const nonce = (await hmac(prk, te.encode('Content-Encoding: nonce\0\x01'))).slice(0, 12)

  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const conRelleno = unir(contenido, new Uint8Array([2])) // 0x02 = último (y único) registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, conRelleno))

  const rs = new Uint8Array([0, 0, 16, 0]) // 4096
  return unir(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado)
}

/** Firma VAPID (JWT ES256) para el servidor de push del endpoint. */
export async function encabezadoVapid(endpoint: string, vapid: Vapid): Promise<string> {
  const pub = b64urlADatos(vapid.publica)
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: vapid.privada,
    x: datosAB64url(pub.slice(1, 33)),
    y: datosAB64url(pub.slice(33, 65)),
    ext: true,
  }
  const clave = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const cabecera = datosAB64url(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const cuerpo = datosAB64url(
    te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.contacto })),
  )
  const firma = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, te.encode(`${cabecera}.${cuerpo}`)),
  )
  return `vapid t=${cabecera}.${cuerpo}.${datosAB64url(firma)}, k=${vapid.publica}`
}

async function enviarUna(s: Suscripcion, vapid: Vapid, contenido: Uint8Array) {
  try {
    const cuerpo = await cifrar(contenido, s.p256dh, s.auth)
    const r = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await encabezadoVapid(s.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(24 * 3600),
        Urgency: 'normal',
      },
      body: cuerpo,
    })
    return { endpoint: s.endpoint.slice(0, 60), estado: r.status, vencida: r.status === 404 || r.status === 410 }
  } catch (e) {
    return { endpoint: s.endpoint.slice(0, 60), estado: 0, error: String(e) }
  }
}

export async function atender(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')
  let datos: { vapid?: Vapid; suscripciones?: Suscripcion[]; aviso?: Aviso }
  try {
    datos = await req.json()
  } catch {
    return new Response('JSON inválido', { status: 400 })
  }
  const { vapid, suscripciones, aviso } = datos
  if (!vapid?.publica || !vapid?.privada || !Array.isArray(suscripciones) || !aviso?.texto) {
    return new Response('Faltan datos', { status: 400 })
  }
  const contenido = te.encode(
    JSON.stringify({ titulo: String(aviso.titulo).slice(0, 80), texto: String(aviso.texto).slice(0, 300), url: String(aviso.url ?? '/grupos') }),
  )
  const validas = suscripciones
    .filter((s) => typeof s?.endpoint === 'string' && s.endpoint.startsWith('https://'))
    .slice(0, 10)
  const resultados = await Promise.all(validas.map((s) => enviarUna(s, vapid, contenido)))
  return new Response(JSON.stringify({ resultados }), { headers: { 'Content-Type': 'application/json' } })
}

declare const Deno: { serve?: (h: (req: Request) => Promise<Response>) => void } | undefined
if (typeof Deno !== 'undefined' && Deno?.serve) Deno.serve(atender)
