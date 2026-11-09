import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { conTimeout, REGLAS, traducirError } from './Login'

/** Pantalla a la que lleva el link de "recuperar contraseña" del email. */
export default function NuevaClave() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [repetir, setRepetir] = useState('')
  const [ver, setVer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(false)

  const valida = REGLAS.every((r) => r.cumple(password))
  const coinciden = password === repetir

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!valida) return setError('La contraseña no cumple los requisitos.')
    if (!coinciden) return setError('Las dos contraseñas no coinciden.')
    setBusy(true)
    try {
      const { error } = await conTimeout(supabase.auth.updateUser({ password }))
      if (error) throw error
      setListo(true)
      setTimeout(() => navigate('/', { replace: true }), 1800)
    } catch (err) {
      const msg = traducirError(err)
      setError(/different from the old/i.test(msg) ? 'La contraseña nueva tiene que ser distinta de la anterior.' : msg)
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <main className="screen">
        <header className="brand">
          <img src="/icons/icon-192.png" alt="" width={56} height={56} />
          <h1>Finanzas</h1>
        </header>
        <section className="card">
          <h2>El link no es válido</h2>
          <p className="muted">Puede que haya vencido (dura 1 hora) o que ya se haya usado. Pedí uno nuevo.</p>
          <Link to="/ingresar?recuperar" className="primary boton">
            Pedir otro link
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="screen">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>Nueva contraseña</h1>
        <p className="muted">{session.user.email}</p>
      </header>

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="nueva">Contraseña nueva</label>
          <input
            id="nueva"
            type={ver ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-describedby="reglas-nueva"
          />
          <ul id="reglas-nueva" className="reglas">
            {REGLAS.map((r) => {
              const ok = r.cumple(password)
              return (
                <li key={r.texto} className={ok ? 'ok' : ''}>
                  <span aria-hidden="true">{ok ? '✓' : '○'}</span> {r.texto}
                </li>
              )
            })}
          </ul>
        </div>
        <label>
          Repetila
          <input type={ver ? 'text' : 'password'} value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        </label>
        {repetir && !coinciden && <p className="error chico">No coinciden.</p>}
        <label className="check">
          <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
          <span>Mostrar contraseñas</span>
        </label>

        {error && <p className="error">{error}</p>}
        {listo && <p className="info">Listo, tu contraseña quedó cambiada. Te llevamos a la app…</p>}

        <button className="primary" disabled={busy || listo || !valida || !coinciden}>
          {busy ? 'Un momento…' : 'Guardar contraseña'}
        </button>
      </form>
    </main>
  )
}
