import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

/** Se muestra a quien todavía no aceptó la política (p. ej. cuentas creadas con Google). */
export default function Consentimiento() {
  const { recargar } = usePerfil()
  const [acepta, setAcepta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aceptar() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('aceptar_politica')
    if (error) {
      setError('No se pudo registrar la aceptación. Probá de nuevo.')
      setBusy(false)
      return
    }
    await recargar()
  }

  return (
    <main className="screen">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>Un paso más</h1>
        <p className="muted">Antes de empezar, necesitamos tu conformidad.</p>
      </header>
      <section className="card">
        <label className="check">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
          <span>
            Leí y acepto la <Link to="/privacidad">política de privacidad</Link>, incluido que mis datos se alojan en
            servidores de la Unión Europea.
          </span>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={aceptar} disabled={!acepta || busy}>
          {busy ? 'Un momento…' : 'Continuar'}
        </button>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          No acepto, salir
        </button>
      </section>
    </main>
  )
}
