import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { prepararDemo } from '../lib/demo'
import { usePerfil } from '../lib/perfil'

/** Link /demo: entra sin cuenta, con datos de ejemplo. */
export default function Demo() {
  const navigate = useNavigate()
  const { recargar } = usePerfil()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    prepararDemo().then(async (err) => {
      if (!vivo) return
      if (err) return setError(err)
      // Primero se va al Resumen y después se recarga el perfil (recargarlo acá vuelve a montar esta pantalla).
      navigate('/', { replace: true })
      recargar()
    })
    return () => {
      vivo = false
    }
  }, [navigate, recargar])

  return (
    <main className="screen center">
      <img src="/icons/icon-192.png" alt="" width={56} height={56} />
      {error ? (
        <>
          <p className="error">{error}</p>
          <Link to="/ingresar">Ir a ingresar o crear cuenta</Link>
        </>
      ) : (
        <p className="muted">Armando la demo con datos de ejemplo…</p>
      )}
    </main>
  )
}
