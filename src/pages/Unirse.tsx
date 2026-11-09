import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Invitacion = { grupo_id: string; nombre: string; invitados: { id: string; nombre: string }[]; ya_soy_miembro: boolean }

/** Entrar a un grupo con el link de invitación. */
export default function Unirse() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [inv, setInv] = useState<Invitacion | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.rpc('ver_invitacion', { p_token: token }).then(({ data, error }) => {
      const fila = (data as Invitacion[] | null)?.[0]
      if (error || !fila) setError('El link de invitación no es válido o ya fue renovado. Pedí uno nuevo.')
      else if (fila.ya_soy_miembro) navigate(`/grupos/${fila.grupo_id}`, { replace: true })
      else setInv(fila)
      setCargando(false)
    })
  }, [token, navigate])

  async function unirme() {
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('unirse_grupo', { p_token: token, p_invitado: elegido })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/grupos/${data}`, { replace: true })
  }

  if (cargando) return <main className="screen center muted">Cargando…</main>

  return (
    <main className="screen">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>{inv ? `Te invitaron a "${inv.nombre}"` : 'Invitación'}</h1>
      </header>
      {error && <p className="error">{error}</p>}
      {inv && (
        <section className="card formulario">
          {inv.invitados.length > 0 && (
            <div className="grupo">
              <span className="grupo-titulo">¿Ya te cargaron en el grupo?</span>
              <small className="muted">Si sos uno de ellos, elegilo para quedarte con tus gastos ya cargados.</small>
              <div className="chips">
                {inv.invitados.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    className="chip"
                    aria-pressed={elegido === i.id}
                    onClick={() => setElegido(elegido === i.id ? null : i.id)}
                  >
                    Soy {i.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="muted chico">
            Los miembros del grupo van a ver tu nombre y los gastos del grupo. Tus finanzas personales siguen siendo solo
            tuyas.
          </p>
          <button className="primary" onClick={unirme} disabled={busy}>
            {busy ? 'Entrando…' : 'Unirme al grupo'}
          </button>
        </section>
      )}
    </main>
  )
}
