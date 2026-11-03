import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true cuando faltan las variables de entorno de Supabase (app sin configurar). */
export const supabaseMissingConfig = !url || !anonKey

// La anon key es pública por diseño: la seguridad de los datos la dan las
// políticas de Row Level Security definidas en supabase/migrations.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
