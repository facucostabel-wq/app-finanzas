import { useState } from 'react'
import { BellRing } from 'lucide-react'
import { activarPush, useEstadoPush } from '../lib/push'

/**
 * Campanita discreta en la barra de Grupos para activar las notificaciones.
 * Solo aparece si se pueden activar y todavía no están activas; el resto se maneja en Ajustes.
 */
export default function CampanaPush() {
  const { estado, refrescar } = useEstadoPush()
  const [busy, setBusy] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)

  if (estado !== 'inactivo' && estado !== 'ios-instalar') return null

  async function tocar() {
    if (estado === 'ios-instalar') {
      setMensaje(
        mensaje ? null : 'En iPhone, primero agregá la app a la pantalla de inicio (Safari → Compartir → Agregar a inicio) y abrila desde ese ícono.',
      )
      return
    }
    setBusy(true)
    setMensaje(null)
    try {
      await activarPush()
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      refrescar()
    }
  }

  return (
    <div className="campana-push">
      <button className="chip-campana" onClick={tocar} disabled={busy} aria-label="Activar notificaciones de los grupos">
        <BellRing size={15} aria-hidden="true" />
        {busy ? 'Activando…' : 'Activar avisos'}
      </button>
      {mensaje && <p className="chico muted campana-mensaje">{mensaje}</p>}
    </div>
  )
}
