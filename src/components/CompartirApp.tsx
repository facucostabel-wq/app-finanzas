import { useState } from 'react'
import { PlayCircle, Share2, UserPlus } from 'lucide-react'
import { compartirApp, type QueCompartir } from '../lib/compartir'

/**
 * "Compartir la app": al tocarlo se elige qué mandar, el link de la demo (la prueban sin
 * cuenta) o el de crear cuenta.
 */
export default function CompartirApp({ variante = 'boton' }: { variante?: 'boton' | 'menu' }) {
  const [abierto, setAbierto] = useState(false)
  const [copiado, setCopiado] = useState(false)

  async function mandar(que: QueCompartir) {
    const r = await compartirApp(que)
    if (r === 'copiado') {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
    if (r !== 'cancelado') setAbierto(false)
  }

  const claseBoton = variante === 'menu' ? 'menu-enlace' : 'primary boton-ancho compartir-app'
  return (
    <div className={`compartir ${variante}`}>
      <button className={claseBoton} onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}>
        <Share2 size={variante === 'menu' ? 20 : 18} strokeWidth={variante === 'menu' ? 1.8 : 2} aria-hidden="true" />
        Compartir la app
      </button>
      {abierto && (
        <div className="compartir-opciones">
          <button onClick={() => mandar('demo')}>
            <PlayCircle size={20} aria-hidden="true" />
            <span>
              <strong>Probar la demo</strong>
              <small>La usan con datos de ejemplo, sin crear cuenta</small>
            </span>
          </button>
          <button onClick={() => mandar('registro')}>
            <UserPlus size={20} aria-hidden="true" />
            <span>
              <strong>Crear cuenta</strong>
              <small>Arrancan directo con la suya</small>
            </span>
          </button>
        </div>
      )}
      {copiado && (
        <p className="info chico" role="status">
          Link copiado
        </p>
      )}
    </div>
  )
}
