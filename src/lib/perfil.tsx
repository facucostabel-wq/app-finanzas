import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

export const MONEDAS_POR_DEFECTO = ['ARS', 'USD', 'EUR']

export type Perfil = { nombre: string; consentimiento_at: string | null; monedas_favoritas: string[] }

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
    const completo = await supabase
      .from('perfiles')
      .select('nombre, consentimiento_at, monedas_favoritas')
      .eq('id', userId)
      .maybeSingle()
    let data: Partial<Perfil> | null = completo.data
    if (completo.error) {
      // Compatibilidad: base sin la columna de monedas (migración 0003 pendiente).
      const basico = await supabase.from('perfiles').select('nombre, consentimiento_at').eq('id', userId).maybeSingle()
      data = basico.data
    }
    setPerfil(
      data
        ? {
            nombre: data.nombre ?? '',
            consentimiento_at: data.consentimiento_at ?? null,
            monedas_favoritas: data.monedas_favoritas?.length ? data.monedas_favoritas : MONEDAS_POR_DEFECTO,
          }
        : null,
    )
    setLoading(false)
  }, [userId])

  useEffect(() => {
    recargar()
  }, [recargar])

  return <PerfilContext.Provider value={{ perfil, loading, recargar }}>{children}</PerfilContext.Provider>
}

export const usePerfil = () => useContext(PerfilContext)
