import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { fechaLarga, ULTIMO_CAMBIO } from '../lib/politica'
import { supabase } from '../lib/supabase'

/**
 * Aviso (no bloqueante) cuando la política de privacidad cambió después de que el usuario
 * la aceptó o vio por última vez. Se va con "Entendido".
 */
export default function AvisoPolitica() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [mostrar, setMostrar] = useState(false)

  useEffect(() => {
    if (!uid) return
    let vigente = true
    supabase
      .from('perfiles')
      .select('consentimiento_at, politica_vista_at')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!vigente || error || !data) return // base sin la columna todavía: no se avisa
        const visto = [data.politica_vista_at, data.consentimiento_at].filter(Boolean).sort().pop() as string | undefined
        // La fecha del cambio se compara al final de ese día (hora de Argentina).
        setMostrar(Boolean(visto) && visto! < `${ULTIMO_CAMBIO.fecha}T03:00:00Z`)
      })
    return () => {
      vigente = false
    }
  }, [uid])

  if (!mostrar) return null

  async function entendido() {
    setMostrar(false)
    await supabase.rpc('marcar_politica_vista')
  }

  return (
    <aside className="aviso-politica" role="status">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <strong>Actualizamos la política de privacidad</strong> ({fechaLarga(ULTIMO_CAMBIO.fecha)})
        <p>{ULTIMO_CAMBIO.resumen}</p>
        <div className="aviso-politica-acciones">
          <Link to="/privacidad">Leerla completa</Link>
          <button onClick={entendido}>Entendido</button>
        </div>
      </div>
    </aside>
  )
}
