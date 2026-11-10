import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { exportarDatos } from '../lib/exportar'
import { desactivarPush } from '../lib/push'
import { supabase } from '../lib/supabase'
import { abrirTutorial } from './Tutorial'

export default function MiCuenta() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const email = session?.user.email
  const [exportando, setExportando] = useState(false)
  const [exportado, setExportado] = useState<string | null>(null)
  const [borrando, setBorrando] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportar() {
    setExportando(true)
    setError(null)
    setExportado(null)
    try {
      const n = await exportarDatos(email)
      setExportado(`Listo: se descargaron 2 archivos (${n} registros). El .csv se abre con Excel o Google Sheets.`)
    } catch (e) {
      setError(`No se pudo exportar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setExportando(false)
    }
  }

  async function borrar() {
    setBusy(true)
    setError(null)
    await desactivarPush()
    const { error } = await supabase.rpc('borrar_mi_cuenta')
    if (error) {
      setBusy(false)
      return setError(`No se pudo borrar la cuenta: ${error.message}`)
    }
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* nada */
    }
    await supabase.auth.signOut().catch(() => {})
    navigate('/ingresar', { replace: true })
  }

  return (
    <>
      <section className="card">
        <p className="muted">{email}</p>
        <Link to="/privacidad">Política de privacidad</Link>
        <button className="secundario" onClick={abrirTutorial}>
          Ver el tutorial
        </button>
      </section>

      <section className="card">
        <h2>Tus datos</h2>
        <p className="muted chico">
          Descargá todo lo que cargaste: un archivo completo (.json) y tus movimientos en planilla (.csv).
        </p>
        <button className="secundario" onClick={exportar} disabled={exportando}>
          {exportando ? 'Preparando…' : 'Exportar mis datos'}
        </button>
        {exportado && (
          <p className="info chico" role="status">
            {exportado}
          </p>
        )}
      </section>

      <section className="card zona-peligro">
        <h2>Borrar mi cuenta</h2>
        {!borrando ? (
          <>
            <p className="muted chico">Se borran tu cuenta y todos tus datos. No se puede deshacer.</p>
            <button className="peligro" onClick={() => setBorrando(true)}>
              Borrar mi cuenta
            </button>
          </>
        ) : (
          <>
            <p className="chico">Antes de seguir, te conviene exportar tus datos. Esto pasa al borrar:</p>
            <ul className="chico lista-simple">
              <li>Se borran tu usuario, tus cuentas, movimientos, categorías, cuotas, inversiones y avisos.</li>
              <li>
                En los grupos compartidos, los gastos y pagos siguen existiendo para los demás. Vos pasás a figurar
                como invitado, solo con tu nombre.
              </li>
              <li>Los grupos donde no queda nadie más con cuenta se borran enteros.</li>
            </ul>
            <label>
              Escribí BORRAR para confirmar
              <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoCapitalize="characters" autoComplete="off" />
            </label>
            <button className="peligro" onClick={borrar} disabled={busy || confirmacion.trim().toUpperCase() !== 'BORRAR'}>
              {busy ? 'Borrando…' : 'Borrar definitivamente'}
            </button>
            <button
              className="link"
              onClick={() => {
                setBorrando(false)
                setConfirmacion('')
              }}
            >
              Cancelar
            </button>
          </>
        )}
      </section>
      {error && <p className="error">{error}</p>}
    </>
  )
}
