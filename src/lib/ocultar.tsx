import { useSyncExternalStore, type ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// "Ocultar saldos": se guarda en el dispositivo y queda así hasta que se cambie,
// aunque se cierre la app.
const CLAVE = 'saldos_ocultos'
const EVENTO = 'saldos-ocultos'

function leer() {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso)
  window.addEventListener('storage', aviso) // otra pestaña
  return () => {
    window.removeEventListener(EVENTO, aviso)
    window.removeEventListener('storage', aviso)
  }
}

export function useSaldosOcultos() {
  return useSyncExternalStore(suscribir, leer, () => false)
}

export function alternarSaldos() {
  try {
    localStorage.setItem(CLAVE, leer() ? '0' : '1')
  } catch {
    /* sin almacenamiento: no se puede recordar */
  }
  window.dispatchEvent(new Event(EVENTO))
}

/** Muestra el monto, o puntitos si los saldos están ocultos. */
export function Oculto({ children }: { children: ReactNode }) {
  const ocultos = useSaldosOcultos()
  return ocultos ? (
    <span className="oculto" aria-label="Monto oculto">
      ••••••
    </span>
  ) : (
    <>{children}</>
  )
}

/** Botón del ojito para mostrar u ocultar los saldos. */
export function BotonOjo({ className = '' }: { className?: string }) {
  const ocultos = useSaldosOcultos()
  return (
    <button
      type="button"
      className={`boton-ojo ${className}`}
      onClick={alternarSaldos}
      aria-pressed={ocultos}
      aria-label={ocultos ? 'Mostrar saldos' : 'Ocultar saldos'}
      title={ocultos ? 'Mostrar saldos' : 'Ocultar saldos'}
    >
      {ocultos ? <EyeOff size={20} strokeWidth={1.9} /> : <Eye size={20} strokeWidth={1.9} />}
    </button>
  )
}
