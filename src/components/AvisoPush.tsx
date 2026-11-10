import { useState } from 'react'
import { activarPush, desactivarPush, useEstadoPush } from '../lib/push'

const CLAVE_OCULTO = 'aviso_push_oculto'

/**
 * Activar o desactivar las notificaciones push en este dispositivo.
 * En modo compacto (pantalla de Grupos) solo aparece si todavía no están activas.
 */
export default function AvisoPush({ compacto = false }: { compacto?: boolean }) {
  const { estado, refrescar } = useEstadoPush()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_OCULTO) === '1'
    } catch {
      return false
    }
  })

  async function cambiar(activar: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (activar) await activarPush()
      else await desactivarPush()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      refrescar()
    }
  }

  if (estado === 'cargando') return null
  if (compacto && (oculto || estado === 'activo' || estado === 'no-soportado' || estado === 'bloqueado')) return null

  const ocultar = () => {
    try {
      localStorage.setItem(CLAVE_OCULTO, '1')
    } catch {
      /* nada */
    }
    setOculto(true)
  }

  return (
    <div className={compacto ? 'card aviso-push' : 'aviso-push-ajustes'}>
      {estado === 'activo' && (
        <>
          <p className="positivo">✓ Activadas en este dispositivo.</p>
          <button className="secundario" onClick={() => cambiar(false)} disabled={busy}>
            Desactivar
          </button>
        </>
      )}
      {estado === 'inactivo' && (
        <>
          {compacto && <p>Activá las notificaciones para enterarte cuando alguien carga un gasto o te paga.</p>}
          <button className="primary" onClick={() => cambiar(true)} disabled={busy}>
            {busy ? 'Activando…' : 'Activar notificaciones'}
          </button>
          {compacto && (
            <button className="link" onClick={ocultar}>
              Ahora no
            </button>
          )}
        </>
      )}
      {estado === 'ios-instalar' && (
        <>
          <p>
            En iPhone, primero agregá la app a la pantalla de inicio: en Safari tocá <b>Compartir</b> →{' '}
            <b>Agregar a inicio</b>, y abrila desde ese ícono.
          </p>
          {compacto && (
            <button className="link" onClick={ocultar}>
              Entendido
            </button>
          )}
        </>
      )}
      {estado === 'bloqueado' && (
        <p className="muted">
          Las notificaciones están bloqueadas para esta app. Habilitalas desde los ajustes del navegador o del celular.
        </p>
      )}
      {estado === 'no-soportado' && <p className="muted">Este navegador no permite notificaciones push.</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
