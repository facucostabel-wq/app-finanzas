import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { horasRestantes, salirDeDemo } from '../lib/demo'

/** Franja fija arriba mientras se usa la demo, con el paso a crear la cuenta propia. */
export default function FranjaDemo() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const h = horasRestantes(session)
  const resta = h >= 1 ? `se borra en ${Math.floor(h)} h` : 'se borra en menos de 1 h'

  async function crearCuenta() {
    if (!window.confirm('Se borra todo lo de la demo y creás tu cuenta de cero. ¿Seguimos?')) return
    setBusy(true)
    const err = await salirDeDemo('registrarse')
    setBusy(false)
    if (err) return setError(`No se pudo salir de la demo: ${err}`)
    navigate('/ingresar?registrarse', { replace: true })
  }

  return (
    <div className="franja-demo" role="status">
      <span>
        <strong>Demo</strong> · {resta}
      </span>
      <button onClick={crearCuenta} disabled={busy}>
        {busy ? 'Un momento…' : 'Crear mi cuenta'}
      </button>
      {error && <p className="error chico">{error}</p>}
    </div>
  )
}
