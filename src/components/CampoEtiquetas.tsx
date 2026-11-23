import { useState } from 'react'
import { Hash, X } from 'lucide-react'
import { crearEtiqueta, esEvento, type Etiqueta } from '../lib/etiquetas'

/**
 * Elegir etiquetas de un movimiento: chips de las elegidas, sugerencias al escribir y
 * "Crear #nombre" si no existe. Las de un evento en curso llegan ya elegidas (se pueden quitar).
 */
export default function CampoEtiquetas(props: {
  todas: Etiqueta[]
  elegidas: string[]
  onCambio: (ids: string[]) => void
  onCreada: (e: Etiqueta) => void
  porEvento?: string[]
}) {
  const { todas, elegidas, onCambio, onCreada, porEvento = [] } = props
  const [texto, setTexto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const limpio = texto.replace(/^#/, '').trim()
  const sugeridas = todas
    .filter((e) => !elegidas.includes(e.id) && (!limpio || e.nombre.toLowerCase().includes(limpio.toLowerCase())))
    .slice(0, 6)
  const existe = todas.some((e) => e.nombre.toLowerCase() === limpio.toLowerCase())

  async function crear() {
    if (!limpio || busy) return
    setBusy(true)
    setError(null)
    const { etiqueta, error } = await crearEtiqueta(limpio)
    setBusy(false)
    if (!etiqueta) return setError(error ?? 'No se pudo crear la etiqueta')
    onCreada(etiqueta)
    onCambio([...elegidas, etiqueta.id])
    setTexto('')
  }

  return (
    <div className="grupo campo-etiquetas">
      <span className="grupo-titulo">Etiquetas (opcional)</span>
      {elegidas.length > 0 && (
        <div className="chips">
          {elegidas.map((id) => {
            const e = todas.find((x) => x.id === id)
            if (!e) return null
            return (
              <span key={id} className="chip-etiqueta">
                #{e.nombre}
                {porEvento.includes(id) && <small> · por el evento</small>}
                <button type="button" onClick={() => onCambio(elegidas.filter((x) => x !== id))} aria-label={`Quitar ${e.nombre}`}>
                  <X size={14} />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="etiqueta-entrada">
        <Hash size={16} aria-hidden="true" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              const igual = todas.find((x) => x.nombre.toLowerCase() === limpio.toLowerCase())
              if (igual) {
                if (!elegidas.includes(igual.id)) onCambio([...elegidas, igual.id])
                setTexto('')
              } else crear()
            }
          }}
          placeholder="bariloche, cumple, regalos…"
          maxLength={40}
          aria-label="Agregar etiqueta"
        />
      </div>
      {(sugeridas.length > 0 || (limpio && !existe)) && (
        <div className="chips">
          {sugeridas.map((e) => (
            <button
              type="button"
              key={e.id}
              className="chip"
              onClick={() => {
                onCambio([...elegidas, e.id])
                setTexto('')
              }}
            >
              #{e.nombre}
              {esEvento(e) && <small className="muted"> · evento</small>}
            </button>
          ))}
          {limpio && !existe && (
            <button type="button" className="chip chip-crear" onClick={crear} disabled={busy}>
              + Crear #{limpio}
            </button>
          )}
        </div>
      )}
      {error && <p className="error chico">{error}</p>}
    </div>
  )
}
