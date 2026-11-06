import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import { TEXTO_FORMA_PAGO, TEXTO_TIPO, useActivos, useCategorias, useMovimientosDelMes, type Movimiento } from '../lib/datos'
import { formatCantidad, formatMonto, formatPrecio, nombreDia } from '../lib/format'
import { SelectorMes, useMes } from '../lib/mes'

const SIGNO: Record<Movimiento['tipo'], string> = { gasto: '−', ingreso: '+', aporte: '→', rescate: '←', pago_tarjeta: '−' }

export default function Movimientos() {
  const { mes } = useMes()
  const { movimientos, loading, error } = useMovimientosDelMes(mes)
  const { categorias } = useCategorias()
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]))
  const { activos } = useActivos()
  const nombresActivo = new Map(activos.map((a) => [a.id, a.nombre]))

  // Agrupa por día (ya vienen ordenados del más reciente al más viejo).
  const dias: { fecha: string; items: Movimiento[] }[] = []
  for (const m of movimientos) {
    const ultimo = dias[dias.length - 1]
    if (ultimo?.fecha === m.fecha) ultimo.items.push(m)
    else dias.push({ fecha: m.fecha, items: [m] })
  }

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <h1>Movimientos</h1>
      </header>
      <SelectorMes />

      {error && <p className="error">No se pudieron cargar los movimientos: {error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : dias.length === 0 ? (
        <p className="muted">No hay movimientos en este mes.</p>
      ) : (
        dias.map((d) => (
          <section key={d.fecha} className="dia">
            <h2 className="dia-titulo">{nombreDia(d.fecha)}</h2>
            <ul className="lista card">
              {d.items.map((m) => (
                <li key={m.id}>
                  <Link to={`/movimiento/${m.id}`} className="fila">
                    <div>
                      <div>
                        {m.categoria_id ? (nombres.get(m.categoria_id) ?? '—') : 'Pago de tarjeta'}
                        {m.activo_id && <span className="muted"> · {nombresActivo.get(m.activo_id)}</span>}
                      </div>
                      <div className="muted chico">
                        {m.forma_pago ? TEXTO_FORMA_PAGO[m.forma_pago] : TEXTO_TIPO[m.tipo]}
                        {m.cantidad
                          ? ` · ${formatCantidad(m.cantidad)} a ${formatPrecio(m.monto / m.cantidad, m.moneda)}`
                          : ''}
                        {m.nota ? ` · ${m.nota}` : ''}
                      </div>
                    </div>
                    <div className={`monto ${m.tipo}`}>
                      {SIGNO[m.tipo]} {formatMonto(m.monto, m.moneda)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <BottomNav />
    </main>
  )
}
