import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Mode = 'ingresar' | 'registrarse'

export default function Login() {
  const [mode, setMode] = useState<Mode>('ingresar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acepta, setAcepta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'ingresar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        if (!acepta) throw new Error('Para crear la cuenta tenés que aceptar la política de privacidad.')
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nombre: nombre.trim(), consentimiento_at: new Date().toISOString() },
          },
        })
        if (error) throw error
        setInfo('Te enviamos un email para confirmar la cuenta. Abrilo desde este dispositivo.')
      }
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setBusy(false)
    }
  }

  const registrarse = mode === 'registrarse'

  return (
    <main className="screen">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>Finanzas</h1>
        <p className="muted">Tus movimientos, solo para vos.</p>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!registrarse} onClick={() => setMode('ingresar')}>
          Ingresar
        </button>
        <button role="tab" aria-selected={registrarse} onClick={() => setMode('registrarse')}>
          Crear cuenta
        </button>
      </div>

      <form className="card" onSubmit={onSubmit}>
        {registrarse && (
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="given-name" />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            autoComplete={registrarse ? 'new-password' : 'current-password'}
          />
          {registrarse && <small className="muted">Mínimo 10 caracteres.</small>}
        </label>

        {registrarse && (
          <label className="check">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>
              Leí y acepto la <Link to="/privacidad">política de privacidad</Link>, incluido que mis datos se alojan
              en servidores de la Unión Europea.
            </span>
          </label>
        )}

        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}

        <button className="primary" disabled={busy}>
          {busy ? 'Un momento…' : registrarse ? 'Crear cuenta' : 'Ingresar'}
        </button>
      </form>
    </main>
  )
}

function traducirError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu email. Revisá tu casilla.'
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese email.'
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
  return msg
}
