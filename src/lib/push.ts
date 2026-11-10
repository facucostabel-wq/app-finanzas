import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

/** Avisa a toda la app que cambiaron las notificaciones (para refrescar el numerito). */
export const avisarCambioNotificaciones = () => window.dispatchEvent(new Event('notificaciones-cambiaron'))

export type EstadoPush = 'cargando' | 'no-soportado' | 'ios-instalar' | 'bloqueado' | 'activo' | 'inactivo'

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const instalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

function b64urlABytes(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registro() {
  await navigator.serviceWorker.register('/sw.js')
  return navigator.serviceWorker.ready
}

async function estadoActual(): Promise<EstadoPush> {
  const soportado = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!soportado) return esIOS() && !instalada() ? 'ios-instalar' : 'no-soportado'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo'
}

export async function activarPush() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('No diste permiso para las notificaciones.')
  const { data: clave, error } = await supabase.rpc('clave_push')
  if (error || !clave) throw new Error('Las notificaciones todavía no están configuradas en el servidor.')
  const reg = await registro()
  const opciones = { userVisibleOnly: true, applicationServerKey: b64urlABytes(clave as string) }
  let sub: PushSubscription
  try {
    sub = await reg.pushManager.subscribe(opciones)
  } catch {
    // Si había una suscripción con otra clave, se rehace.
    await (await reg.pushManager.getSubscription())?.unsubscribe()
    sub = await reg.pushManager.subscribe(opciones)
  }
  const j = sub.toJSON()
  const { error: e2 } = await supabase.rpc('guardar_suscripcion', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
  })
  if (e2) throw new Error(e2.message)
}

/** Quita la suscripción de este dispositivo (también al cerrar sesión). */
export async function desactivarPush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_suscripciones').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch {
    /* sin soporte: no hay nada que quitar */
  }
}

/** Si este dispositivo ya tenía push, se asegura de que quede a nombre de la cuenta actual. */
export async function sincronizarPush() {
  try {
    if ((await estadoActual()) !== 'activo') return
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
    const j = sub?.toJSON()
    if (j?.endpoint) await supabase.rpc('guardar_suscripcion', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth })
  } catch {
    /* no es crítico */
  }
}

export function useEstadoPush() {
  const [estado, setEstado] = useState<EstadoPush>('cargando')
  const refrescar = useCallback(async () => setEstado(await estadoActual().catch(() => 'no-soportado' as const)), [])
  useEffect(() => {
    refrescar()
  }, [refrescar])
  return { estado, refrescar }
}

export type Notificacion = { id: string; grupo_id: string | null; titulo: string; texto: string; url: string; leida: boolean; creado_at: string }

/** Avisos sin leer (para el numerito y la lista de novedades). */
export function useNoLeidas() {
  const [items, setItems] = useState<Notificacion[]>([])
  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, grupo_id, titulo, texto, url, leida, creado_at')
      .eq('leida', false)
      .order('creado_at', { ascending: false })
      .limit(30)
    if (!error) setItems((data ?? []) as Notificacion[])
  }, [])
  useEffect(() => {
    cargar()
    const visible = () => document.visibilityState === 'visible' && cargar()
    window.addEventListener('notificaciones-cambiaron', cargar)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('notificaciones-cambiaron', cargar)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [cargar])
  return { items, recargar: cargar }
}

export async function marcarLeidas(grupoId?: string) {
  let q = supabase.from('notificaciones').update({ leida: true }).eq('leida', false)
  if (grupoId) q = q.eq('grupo_id', grupoId)
  await q
  avisarCambioNotificaciones()
}
