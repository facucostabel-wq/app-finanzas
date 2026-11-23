import { formatMonto } from '../lib/format'
import { nivel, type Estado } from '../lib/presupuestos'
import { Oculto } from '../lib/ocultar'

/** Barra de uso: verde hasta 80%, ámbar hasta 100%, roja si se pasó. */
export default function BarraPresupuesto({ estado, compacta = false }: { estado: Estado; compacta?: boolean }) {
  const { gastado, limite, uso, presupuesto } = estado
  const n = nivel(uso)
  const ancho = uso === null ? 0 : Math.min(uso, 1) * 100
  const texto =
    limite <= 0
      ? 'Todavía no ingresó nada este mes'
      : uso !== null && uso > 1
        ? `Te pasaste ${formatMonto(Math.round((gastado - limite) * 100) / 100, presupuesto.moneda)}`
        : `Quedan ${formatMonto(Math.round((limite - gastado) * 100) / 100, presupuesto.moneda)}`
  if (compacta)
    return (
      <span className={`presupuesto-mini ${n}`}>
        <span className="presupuesto-pista" aria-hidden="true">
          <span className="presupuesto-barra" style={{ width: `${ancho}%` }} />
        </span>
        <span className="chico">{uso === null ? '—' : `${Math.round(uso * 100)}%`}</span>
      </span>
    )
  return (
    <div className={`presupuesto-uso ${n}`}>
      <div className="presupuesto-pista" aria-hidden="true">
        <div className="presupuesto-barra" style={{ width: `${ancho}%` }} />
      </div>
      <div className="presupuesto-numeros chico">
        <span>
          <Oculto>
            {formatMonto(Math.round(gastado * 100) / 100, presupuesto.moneda)} de {formatMonto(Math.round(limite * 100) / 100, presupuesto.moneda)}
          </Oculto>
        </span>
        <span>{uso !== null ? `${Math.round(uso * 100)}% · ` : ''}<Oculto>{texto}</Oculto></span>
      </div>
    </div>
  )
}
