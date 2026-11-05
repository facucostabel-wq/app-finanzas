import BottomNav from '../components/BottomNav'
import { useActivos, useCategorias, useInversiones } from '../lib/datos'
import { formatCantidad, formatMonto, formatPrecio } from '../lib/format'
import { calcularTenencias } from '../lib/tenencias'

export default function Inversiones() {
  const { movimientos, loading, error } = useInversiones()
  const { categorias } = useCategorias()
  const { activos } = useActivos()
  const nombreCat = new Map(categorias.map((c) => [c.id, c.nombre]))
  const divisaDe = new Map(categorias.map((c) => [c.id, c.divisa]))
  const nombreActivo = new Map(activos.map((a) => [a.id, a.nombre]))

  const tenencias = calcularTenencias(movimientos)
  const conCantidad = tenencias.filter((t) => t.cantidad > 0 || t.resultadoRealizado !== 0)
  const sinCantidad = tenencias.reduce((n, t) => n + t.sinCantidad, 0)

  // Agrupadas por categoría (Cripto, CEDEARs…), en el orden de las categorías.
  const orden = new Map(categorias.map((c, i) => [c.id, i]))
  conCantidad.sort(
    (a, b) =>
      (orden.get(a.categoria_id) ?? 99) - (orden.get(b.categoria_id) ?? 99) ||
      (nombreActivo.get(a.activo_id ?? '') ?? '').localeCompare(nombreActivo.get(b.activo_id ?? '') ?? ''),
  )

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <h1>Inversiones</h1>
      </header>
      <p className="muted chico">
        Tenencia y precio promedio de compra (PPP) por activo, calculados con las cantidades que cargaste. Las ventas
        no cambian el PPP.
      </p>

      {error && <p className="error">No se pudieron cargar las inversiones: {error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : conCantidad.length === 0 ? (
        <section className="card vacio">
          <p>Todavía no hay inversiones con cantidad cargada.</p>
          <p className="muted chico">Al cargar una inversión, completá la cantidad comprada para ver acá tu tenencia.</p>
        </section>
      ) : (
        <ul className="lista card">
          {conCantidad.map((t) => (
            <li key={t.clave} className="tenencia">
              <div className="tenencia-cabecera">
                <strong>{t.activo_id ? nombreActivo.get(t.activo_id) : `${nombreCat.get(t.categoria_id)} (general)`}</strong>
                <span className="muted chico">
                  {nombreCat.get(t.categoria_id)} · {t.moneda}
                </span>
              </div>
              <dl className="totales chico">
                <div>
                  <dt>Tenencia</dt>
                  <dd>
                    {divisaDe.get(t.categoria_id)
                      ? formatMonto(t.cantidad, divisaDe.get(t.categoria_id)!)
                      : formatCantidad(t.cantidad)}
                  </dd>
                </div>
                {t.cantidad > 0 && (
                  <>
                    <div>
                      <dt>{divisaDe.get(t.categoria_id) ? `Precio promedio por ${divisaDe.get(t.categoria_id)}` : 'Precio promedio (PPP)'}</dt>
                      <dd>{formatPrecio(t.ppp, t.moneda)}</dd>
                    </div>
                    <div>
                      <dt>Costo de la tenencia</dt>
                      <dd>{formatMonto(Math.round(t.costo * 100) / 100, t.moneda)}</dd>
                    </div>
                  </>
                )}
                {Math.abs(t.resultadoRealizado) >= 0.01 && (
                  <div>
                    <dt>Resultado de ventas</dt>
                    <dd className={t.resultadoRealizado < 0 ? 'negativo' : 'positivo'}>
                      {formatMonto(Math.round(t.resultadoRealizado * 100) / 100, t.moneda)}
                    </dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {sinCantidad > 0 && (
        <p className="muted chico">
          {sinCantidad === 1
            ? '1 movimiento de inversión no tiene cantidad cargada y no entra en este cálculo.'
            : `${sinCantidad} movimientos de inversión no tienen cantidad cargada y no entran en este cálculo.`}
        </p>
      )}
      <BottomNav />
    </main>
  )
}
