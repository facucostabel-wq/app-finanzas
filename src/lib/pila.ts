import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/** Secciones principales: desde cualquiera, "atrás" vuelve al Resumen. */
const SECCIONES = ['/movimientos', '/objetivos', '/grupos', '/inversiones', '/ajustes', '/cierre']
const PUBLICAS = ['/ingresar', '/privacidad', '/nueva-clave']

const posicion = () => (window.history.state?.idx as number | undefined) ?? 0

/**
 * Mantiene el historial con forma [Resumen, sección, …subpantallas], para que el botón
 * atrás del celular vaya primero al Resumen y, desde ahí, salga de la app.
 * React Router guarda en history.state.idx la posición de cada pantalla en el historial.
 */
export function usePilaNavegacion(activa: boolean) {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!activa) return
    const ruta = location.pathname
    if (PUBLICAS.includes(ruta) || ruta.startsWith('/unirse/')) return
    const destino = ruta + location.search + location.hash
    const idx = posicion()

    // Al Resumen: se vuelve a la primera pantalla (así el próximo "atrás" sale).
    if (ruta === '/') {
      if (idx > 0) window.history.go(-idx)
      return
    }
    // Se abrió la app directo en otra pantalla: se pone el Resumen debajo.
    if (idx === 0) {
      navigate('/', { replace: true })
      navigate(destino)
      return
    }
    // A una sección desde más adentro: el historial queda [Resumen, sección].
    if (SECCIONES.includes(ruta) && idx > 1) {
      const alVolver = () => {
        window.removeEventListener('popstate', alVolver)
        navigate(destino, { replace: true })
      }
      window.addEventListener('popstate', alVolver)
      window.history.go(-(idx - 1))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, activa])
}
