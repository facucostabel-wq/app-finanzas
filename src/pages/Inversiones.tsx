import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import IconoCategoria from '../components/IconoCategoria'
import { haceCuanto, type Posicion } from '../lib/cartera'
import { formatCantidad, formatMonto } from '../lib/format'
import { BotonOjo, Oculto } from '../lib/ocultar'
import { useCartera } from '../lib/useCartera'

const COLORES = ['var(--accent)', '#5b8def', '#f5b84a', '#e46b8a', '#9b7bf0', '#4cc3d9', '#8bc34a']
const usd = (n: number) => formatMonto(Math.round(n), 'USD')
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1).replace('.', ',')}%`

export function textoFuente(p: Posicion): string {
  if (p.fuente === 'auto') return 'precio automático'
  if (p.fuente === 'manual') return `actualizado ${haceCuanto(p.valorFecha)}`
  if (p.fuente === 'cierre') return 'al último cierre'
  return 'sin actualizar'
}

export default function Inversiones() {
  const { posiciones, totales, categorias, tipos, loading, error, hayMepHistorico, refrescarCripto } = useCartera()
  const [verVendidas, setVerVendidas] = useState(false)
  const nombreCat = new Map(categorias.map((c) => [c.id, c]))
  const orden = new Map(categorias.map((c, i) => [c.id, i]))

  const abiertas = posiciones
    .filter((p) => p.cantidad > 0 || (p.porMonto && p.costoUsd > 0.005))
    .sort(
      (a, b) =>
        (orden.get(a.categoria_id) ?? 99) - (orden.get(b.categoria_id) ?? 99) || b.valorUsd - a.valorUsd,
    )
  const vendidas = posiciones.filter((p) => !abiertas.includes(p) && Math.abs(p.realizadoUsd) >= 0.5)
  const porCat = new Map<string, Posicion[]>()
  for (const p of abiertas) porCat.set(p.categoria_id, [...(porCat.get(p.categoria_id) ?? []), p])
  const colorDe = new Map(totales.porCategoria.map((c, i) => [c.categoria_id, COLORES[i % COLORES.length]]))
  const mep = tipos.get('USD')

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Inversiones</h1>
        </div>
        <div className="topbar-der">
          <button className="boton-icono" onClick={refrescarCripto} aria-label="Actualizar precios automáticos">
            <RefreshCw size={18} />
          </button>
          <BotonOjo className="boton-icono" />
        </div>
      </header>

      {error && <p className="error">No se pudieron cargar las inversiones: {error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : abiertas.length === 0 ? (
        <section className="card vacio">
          <p>Todavía no tenés inversiones cargadas.</p>
          <p className="muted chico">Cargá una con el botón + → Inversión. Si ponés la cantidad, vas a ver el precio promedio.</p>
        </section>
      ) : (
        <>
          <section className="cartera-hero">
            <span className="hero-etiqueta">Tu cartera hoy</span>
            <p className="hero-monto">
              <Oculto>{usd(totales.valorUsd)}</Oculto>
            </p>
            {mep && (
              <p className="muted chico">
                ≈ <Oculto>{formatMonto(Math.round(totales.valorUsd * mep), 'ARS')}</Oculto> al MEP de hoy
              </p>
            )}
            <div className="cartera-cifras">
              <div>
                <span className="muted chico">Invertiste</span>
                <strong>
                  <Oculto>{usd(totales.costoUsd)}</Oculto>
                </strong>
              </div>
              <div>
                <span className="muted chico">Resultado</span>
                <strong className={totales.resultadoUsd < 0 ? 'negativo' : 'positivo'}>
                  <Oculto>
                    {totales.resultadoUsd >= 0 ? '+' : '−'}
                    {usd(Math.abs(totales.resultadoUsd))}
                  </Oculto>
                  {totales.porcentaje !== null && <span className="cartera-pct"> {pct(totales.porcentaje)}</span>}
                </strong>
              </div>
            </div>
            {Math.abs(totales.realizadoUsd) >= 0.5 && (
              <p className="muted chico">
                Por ventas ya hechas: <Oculto>{`${totales.realizadoUsd >= 0 ? '+' : '−'}${usd(Math.abs(totales.realizadoUsd))}`}</Oculto>
              </p>
            )}
            {totales.sinValor > 0 && (
              <p className="muted chico">
                {totales.sinValor === 1 ? '1 inversión sin valor actualizado cuenta' : `${totales.sinValor} inversiones sin valor actualizado cuentan`}{' '}
                por lo que pagaste. Tocala para actualizarla.
              </p>
            )}
          </section>

          {totales.porCategoria.length > 1 && totales.valorUsd > 0 && (
            <section className="bloque reparto" aria-label="Reparto por categoría">
              <div className="reparto-barra" aria-hidden="true">
                {totales.porCategoria.map((c) => (
                  <span
                    key={c.categoria_id}
                    style={{ width: `${(c.valorUsd / totales.valorUsd) * 100}%`, background: colorDe.get(c.categoria_id) }}
                  />
                ))}
              </div>
              <ul className="reparto-leyenda">
                {totales.porCategoria.map((c) => (
                  <li key={c.categoria_id}>
                    <span className="reparto-punto" style={{ background: colorDe.get(c.categoria_id) }} />
                    <span>{nombreCat.get(c.categoria_id)?.nombre ?? 'Otras'}</span>
                    <span className="muted">{Math.round((c.valorUsd / totales.valorUsd) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {[...porCat].map(([catId, lista]) => (
            <section key={catId} className="bloque">
              <div className="titulo-con-accion">
                <h2>{nombreCat.get(catId)?.nombre ?? 'Inversiones'}</h2>
                <span className="muted chico">
                  <Oculto>{usd(lista.reduce((t, p) => t + p.valorUsd, 0))}</Oculto>
                </span>
              </div>
              <ul className="lista">
                {lista.map((p) => (
                  <li key={p.clave}>
                    <Link to={`/inversiones/${encodeURIComponent(p.clave)}`} className="fila posicion">
                      <IconoCategoria nombre={p.nombre} tipo="aporte" />
                      <div className="posicion-texto">
                        <span className="posicion-nombre">{p.nombre}</span>
                        <span className="muted chico">
                          {p.cantidad > 0 ? (
                            <>
                              <Oculto>{p.divisa ? formatMonto(p.cantidad, p.divisa) : `${formatCantidad(p.cantidad)} u.`}</Oculto> ·{' '}
                            </>
                          ) : null}
                          <span className={p.fuente === 'costo' ? 'sin-valor' : ''}>{textoFuente(p)}</span>
                        </span>
                      </div>
                      <div className="posicion-valor">
                        <strong>
                          <Oculto>{usd(p.valorUsd)}</Oculto>
                        </strong>
                        {p.porcentaje !== null ? (
                          <span className={`pildora ${p.porcentaje < 0 ? 'baja' : 'sube'}`}>{pct(p.porcentaje)}</span>
                        ) : (
                          <span className="muted chico">—</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {vendidas.length > 0 && (
            <section className="cumplidos">
              <button className="link" onClick={() => setVerVendidas((v) => !v)} aria-expanded={verVendidas}>
                {verVendidas ? 'Ocultar' : 'Ver'} inversiones ya vendidas ({vendidas.length})
              </button>
              {verVendidas && (
                <ul className="lista card">
                  {vendidas.map((p) => (
                    <li key={p.clave}>
                      <Link to={`/inversiones/${encodeURIComponent(p.clave)}`} className="fila">
                        <span>{p.nombre}</span>
                        <span className={p.realizadoUsd < 0 ? 'negativo' : 'positivo'}>
                          <Oculto>{`${p.realizadoUsd >= 0 ? '+' : '−'}${usd(Math.abs(p.realizadoUsd))}`}</Oculto>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <p className="muted chico">
            Todo en dólares MEP. Lo que invertiste en pesos se pasa a dólares con el MEP del día de cada compra
            {hayMepHistorico ? '' : ' (sin conexión a la serie histórica, por ahora con el dólar de hoy)'}. Las cripto y las
            monedas se actualizan solas; el resto, tocando cada inversión o con el cierre de mes.
          </p>
        </>
      )}
      <BottomNav />
    </main>
  )
}
