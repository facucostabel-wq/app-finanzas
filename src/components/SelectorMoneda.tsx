import { useState } from 'react'
import { buscarMonedas } from '../lib/monedas'

/** Hoja con buscador de monedas. Se cierra al elegir o al tocar fuera. */
export default function SelectorMoneda({
  onElegir,
  onCerrar,
  excluir = [],
}: {
  onElegir: (codigo: string) => void
  onCerrar: () => void
  excluir?: string[]
}) {
  const [q, setQ] = useState('')
  const resultados = buscarMonedas(q).filter((m) => !excluir.includes(m.codigo))

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-label="Elegir moneda" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cabecera">
          <h2>Elegir moneda</h2>
          <button type="button" className="link" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        <input
          autoFocus
          placeholder="Buscar: real, BRL, libra…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar moneda"
        />
        <ul className="lista-monedas">
          {resultados.map((m) => (
            <li key={m.codigo}>
              <button type="button" onClick={() => onElegir(m.codigo)}>
                <strong>{m.codigo}</strong> <span className="muted">{m.nombre}</span>
              </button>
            </li>
          ))}
          {resultados.length === 0 && <li className="muted">Sin resultados.</li>}
        </ul>
      </div>
    </div>
  )
}
