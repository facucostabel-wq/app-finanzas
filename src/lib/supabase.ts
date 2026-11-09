import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true cuando faltan las variables de entorno de Supabase (app sin configurar). */
export const supabaseMissingConfig = !url || !anonKey

/** Qué variables faltan, para diagnosticar la configuración del deploy. */
export const missingVars = [
  !url && 'VITE_SUPABASE_URL',
  !anonKey && 'VITE_SUPABASE_ANON_KEY',
].filter(Boolean) as string[]

// Se lee antes de crear el cliente, porque el cliente limpia la URL al procesarla.
const hash = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.slice(1))
/** true si se entró desde el link de "recuperar contraseña" del email. */
export const vinoDeRecuperacion = hash.get('type') === 'recovery'
/** Error que vuelve en la URL cuando un link del email venció o ya se usó. */
export const errorDeLink = hash.get('error_code') ?? hash.get('error') ?? null

// La anon key es pública por diseño: la seguridad de los datos la dan las
// políticas de Row Level Security definidas en supabase/migrations.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // "implicit" hace que el link del email funcione aunque se abra en otro navegador
    // (por ejemplo, desde la app de Gmail), no solo en el que lo pidió.
    flowType: 'implicit',
  },
})
