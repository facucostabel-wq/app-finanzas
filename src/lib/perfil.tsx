import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

export type Perfil = { nombre: string; consentimiento_at: string | null }

type PerfilState = { perfil: Perfil | null; loading: boolean; recargar: () => Promise<void> }

const PerfilContext = createContext<PerfilState>({ perfil: null, loading: true, recargar: async () => {} })

export function PerfilProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)
  const userId = session?.user.id

  const recargar = useCallback(async () => {
    if (!userId) {
      setPerfil(null)
      setLoading(false)
      return
    }
    setLoading(true)
    // RLS garantiza que esta consulta solo puede devolver el perfil propio.
    const { data } = await supabase.from('perfiles').select('nombre, consentimiento_at').eq('id', userId).maybeSingle()
    setPerfil(data ?? null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return <PerfilContext.Provider value={{ perfil, loading, recargar }}>{children}</PerfilContext.Provider>
}

export const usePerfil = () => useContext(PerfilContext)
