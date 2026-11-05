import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Mode = 'ingresar' | 'registrarse'

export const MIN_PASSWORD = 10
const TIMEOUT_MS = 20000

/** Evita que la pantalla quede colgada en "Un momento…" si el servidor no responde. */
function conTimeout<T>(promesa: Promise<T>): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
    ),
  ])
}

/** Reglas de contraseña que se muestran en vivo al crear la cuenta. */
const REGLAS: { texto: string; cumple: (p: string) => boolean }[] = [
  { texto: `Al menos ${MIN_PASSWORD} caracteres`, cumple: (p) => p.length >= MIN_PASSWORD },
  { texto: 'Al menos una letra', cumple: (p) => /\p{L}/u.test(p) },
  { texto: 'Al menos un número', cumple: (p) => /\d/.test(p) },
]

export default function Login() {
  const [mode, setMode] = useState<Mode>('ingresar')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [acepta, setAcepta] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null)

  const registrarse = mode === 'registrarse'
  const passwordValida = REGLAS.every((r) => r.cumple(password))

  function cambiarModo(m: Mode) {
    setMode(m)
    setError(null)
    setInfo(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)
    try {
      if (mode === 'ingresar') {
        const { error } = await conTimeout(supabase.auth.signInWithPassword({ email, password }))
        if (error) throw error
      } else {
        if (!passwordValida) throw new Error('La contraseña no cumple los requisitos.')
        if (!acepta) throw new Error('Para crear la cuenta tenés que aceptar la política de privacidad.')
        const { error } = await conTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: { nombre: nombre.trim(), consentimiento_at: new Date().toISOString() },
            },
          }),
        )
        if (error) throw error
        setEmailEnviado(email)
        setInfo(`Te enviamos un email a ${email} para confirmar la cuenta. Revisá también la carpeta de spam.`)
      }
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setBusy(false)
    }
  }

  async function conGoogle() {
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    // Si todo va bien, el navegador se va a Google; solo volvemos acá si hubo un error.
    if (error) {
      setError(traducirError(error))
      setBusy(false)
    }
  }

  async function reenviar() {
    if (!emailEnviado) return
    setError(null)
    setBusy(true)
    try {
      const { error } = await conTimeout(
        supabase.auth.resend({
          type: 'signup',
          email: emailEnviado,
          options: { emailRedirectTo: window.location.origin },
        }),
      )
      if (error) throw error
      setInfo(`Reenviamos el email a ${emailEnviado}.`)
    } catch (err) {
      setError(traducirError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="screen">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>Finanzas</h1>
        <p className="muted">Tus movimientos, solo para vos.</p>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!registrarse} onClick={() => cambiarModo('ingresar')}>
          Ingresar
        </button>
        <button role="tab" aria-selected={registrarse} onClick={() => cambiarModo('registrarse')}>
          Crear cuenta
        </button>
      </div>

      <form className="card" onSubmit={onSubmit}>
        <button type="button" className="google" onClick={conGoogle} disabled={busy}>
          <IconoGoogle /> Continuar con Google
        </button>
        <div className="separador">
          <span>o con tu email</span>
        </div>

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

        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <div className="password">
            <input
              id="password"
              type={verPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={registrarse ? 'new-password' : 'current-password'}
              aria-describedby={registrarse ? 'reglas-password' : undefined}
            />
            <button
              type="button"
              className="ojo"
              onClick={() => setVerPassword((v) => !v)}
              aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={verPassword}
            >
              {verPassword ? <IconoOjoTachado /> : <IconoOjo />}
            </button>
          </div>
          {registrarse && (
            <ul id="reglas-password" className="reglas">
              {REGLAS.map((r) => {
                const ok = r.cumple(password)
                return (
                  <li key={r.texto} className={ok ? 'ok' : ''}>
                    <span aria-hidden="true">{ok ? '✓' : '○'}</span> {r.texto}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

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

        <button className="primary" disabled={busy || (registrarse && (!passwordValida || !acepta))}>
          {busy ? 'Un momento…' : registrarse ? 'Crear cuenta' : 'Ingresar'}
        </button>

        {registrarse && emailEnviado && (
          <button type="button" className="link" onClick={reenviar} disabled={busy}>
            ¿No te llegó? Reenviar email
          </button>
        )}
      </form>
    </main>
  )
}

function traducirError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code = (err as { code?: string })?.code ?? ''
  if (msg === 'timeout')
    return 'El servidor no respondió a tiempo (20 s). Revisá tu conexión y probá de nuevo; si se repite, avisá con una captura.'
  if (/failed to fetch|network/i.test(msg)) return 'No se pudo conectar con el servidor. Revisá tu conexión.'
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Todavía no confirmaste tu email. Revisá tu casilla (y spam).'
  if (/already registered/i.test(msg)) return 'Ya existe una cuenta con ese email.'
  if (/invalid api key|no api key/i.test(msg)) return 'La clave de Supabase cargada en Vercel no es válida.'
  if (code === 'email_address_not_authorized' || /not authorized/i.test(msg))
    return 'Por ahora la app no puede enviar emails a esa dirección (configuración de envío pendiente).'
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg))
    return 'Se alcanzó el límite de emails por hora. Probá de nuevo más tarde.'
  if (/provider is not enabled|unsupported provider/i.test(msg))
    return 'El ingreso con Google todavía no está activado.'
  if (code === 'weak_password' || /password should be/i.test(msg))
    return 'La contraseña es demasiado débil. Revisá los requisitos.'
  return msg
}

function IconoOjo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconoOjoTachado() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-2.6 3.6M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </svg>
  )
}

function IconoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
