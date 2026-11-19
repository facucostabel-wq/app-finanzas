import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** La demo dura 24 horas desde que se entra. */
export const HORAS_DEMO = 24

export const esDemo = (session: Session | null | undefined) => Boolean(session?.user.is_anonymous)

/** Horas que le quedan a la demo (0 si ya terminó). */
export function horasRestantes(session: Session | null | undefined): number {
  const inicio = session?.user.created_at ? Date.parse(session.user.created_at) : NaN
  if (Number.isNaN(inicio)) return HORAS_DEMO
  return Math.max(0, HORAS_DEMO - (Date.now() - inicio) / 3_600_000)
}

const CLAVE_TRAS_DEMO = 'tras_demo'

/** Lee (una vez) adónde iba quien acaba de salir de la demo. */
export function trasDemo(): string | null {
  try {
    const v = sessionStorage.getItem(CLAVE_TRAS_DEMO)
    sessionStorage.removeItem(CLAVE_TRAS_DEMO)
    return v
  } catch {
    return null
  }
}

let preparando: Promise<string | null> | null = null

/**
 * Entra a la demo: usuario anónimo + datos inventados. Devuelve un error legible o null.
 * Se puede llamar varias veces (la pantalla se vuelve a montar mientras carga): hace el trabajo una sola vez.
 */
export function prepararDemo(): Promise<string | null> {
  if (!preparando) {
    preparando = (async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously()
        if (error) {
          return /anonymous/i.test(error.message)
            ? 'La demo no está disponible en este momento.'
            : `No se pudo abrir la demo: ${error.message}`
        }
      } else if (!esDemo(data.session)) {
        return null // ya tiene cuenta: va directo a la suya
      }
      const { error } = await supabase.rpc('crear_demo')
      if (error) return `No se pudieron cargar los datos de ejemplo: ${error.message}`
      return null
    })().then((err) => {
      if (err) preparando = null // con error se puede reintentar
      return err
    })
  }
  return preparando
}

/** Sale de la demo: borra todo lo que tenía y cierra la sesión. Con "registrarse", el login abre en "Crear cuenta". */
export async function salirDeDemo(despues: 'registrarse' | 'ingresar' = 'ingresar'): Promise<string | null> {
  preparando = null
  const { error } = await supabase.rpc('borrar_mi_cuenta')
  if (error) return error.message
  try {
    sessionStorage.setItem(CLAVE_TRAS_DEMO, despues)
  } catch {
    /* sin almacenamiento */
  }
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  return null
}

/** Link para compartir la app: abre la página para elegir entre la demo y crear cuenta. */
export const linkCompartir = () => `${window.location.origin}/bienvenida`
