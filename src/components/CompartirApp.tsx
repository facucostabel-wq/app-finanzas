import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { compartirApp } from '../lib/compartir'

/** "Compartir la app": manda un link que, al abrirlo, deja elegir entre probar la demo o crear cuenta. */
export default function CompartirApp({ variante = 'boton' }: { variante?: 'boton' | 'menu' }) {
  const [copiado, setCopiado] = useState(false)

  async function mandar() {
    if ((await compartirApp()) === 'copiado') {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    }
  }

  const menu = variante === 'menu'
  return (
    <div className={`compartir ${variante}`}>
      <button className={menu ? 'menu-enlace' : 'primary boton-ancho compartir-app'} onClick={mandar}>
        <Share2 size={menu ? 20 : 18} strokeWidth={menu ? 1.8 : 2} aria-hidden="true" />
        Compartir la app
      </button>
      {copiado && (
        <p className="info chico" role="status">
          Link copiado
        </p>
      )}
    </div>
  )
}
