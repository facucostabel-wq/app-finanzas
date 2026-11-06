import { useState } from 'react'
import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import {
  gastosPorCategoria,
  ordenarMonedas,
  totalesPorMoneda,
  useActivos,
  useCategorias,
  useDisponible,
  useMovimientosDelMes,
  useSaldosIniciales,
} from '../lib/datos'
import { formatMonto, mesActual, nombreMes, type Moneda } from '../lib/format'
import { nombreMoneda } from '../lib/monedas'
import { SelectorMes, useMes } from '../lib/mes'
import { usePerfil } from '../lib/perfil'

export default function Home() {
  const { perfil } = usePerfil()
  const { mes } = useMes()
  const { movimientos, loading, error } = useMovimientosDelMes(mes)
  const { categorias } = useCategorias()
  const { activos } = useActivos()
  const { disponible, error: errorDisponible } = useDisponible(mes)
  const { saldos, loading: cargandoSaldos } = useSaldosIniciales()
  const [monedaGastos, setMonedaGastos] = useState<Moneda | null>(null)
  const nombre = perfil?.nombre?.split(' ')[0]
  const favoritas = perfil?.monedas_favoritas ?? []

  const totales = totalesPorMoneda(movimientos, activos)
  const monedas = ordenarMonedas(totales.keys(), favoritas)
  const variasMonedas = monedas.length > 1
  const monedasConGastos = monedas.filter((m) => (totales.get(m)?.gastos ?? 0) > 0)
  const monedaBarras: Moneda =
    monedaGastos && monedasConGastos.includes(monedaGastos) ? monedaGastos : (monedasConGastos[0] ?? '')
  const porCategoria = gastosPorCategoria(movimientos, monedaBarras, categorias)
  const maximo = porCategoria[0]?.total ?? 0
  const totalGastos = totales.get(monedaBarras)?.gastos ?? 0
  const monedasDisponible = ordenarMonedas(
    [...disponible.entries()].filter(([, v]) => Math.abs(v) >= 0.01).map(([m]) => m),
    favoritas,
  )
  const esMesActual = mes === mesActual()

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <h1>Hola{nombre ? `, ${nombre}` : ''}</h1>
      </header>
      <SelectorMes />

      {error && <p className="error">No se pudieron cargar los datos: {error}</p>}

      <section className="card disponible">
        <div className="titulo-con-accion">
          <h2>Dinero disponible</h2>
          <span className="muted chico">{esMesActual ? 'hoy' : `al cierre de ${nombreMes(mes).toLowerCase()}`}</span>
        </div>
        {errorDisponible ? (
          <p className="muted chico">Falta ejecutar el SQL del dinero disponible en Supabase.</p>
        ) : (
          <>
            {monedasDisponible.length === 0 ? (
              <p className="muted">Sin saldo todavía.</p>
            ) : (
              <dl className="totales">
                {monedasDisponible.map((m) => {
                  const v = disponible.get(m)!
                  return (
                    <div key={m} className="destacado-simple">
                      <dt>{nombreMoneda(m)}</dt>
                      <dd className={v < 0 ? 'negativo' : ''}>{formatMonto(Math.round(v * 100) / 100, m)}</dd>
                    </div>
                  )
                })}
              </dl>
            )}
            <p className="muted chico">Saldo inicial + ingresos − gastos − invertido + retirado, acumulado mes a mes.</p>
            {!cargandoSaldos && saldos.size === 0 && (
              <Link to="/ajustes" className="chico">
                Cargá tu saldo inicial en Ajustes para que el disponible arranque desde lo que tenés hoy.
              </Link>
            )}
          </>
        )}
      </section>

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : movimientos.length === 0 ? (
        <section className="card vacio">
          <p>Todavía no hay movimientos este mes.</p>
          <Link to="/nuevo" className="primary boton">Cargar el primero</Link>
        </section>
      ) : (
        <>
          {monedas.map((moneda) => {
            const t = totales.get(moneda)!
            const ahorro = t.ingresos - t.gastos
            const inversionNeta = t.aportes - t.rescates
            return (
              <section className="card" key={moneda}>
                {variasMonedas && <h2>{nombreMoneda(moneda)}</h2>}
                <dl className="totales">
                  <div>
                    <dt>Ingresos</dt>
                    <dd>{formatMonto(t.ingresos, moneda)}</dd>
                  </div>
                  <div>
                    <dt>Gastos</dt>
                    <dd>{formatMonto(t.gastos, moneda)}</dd>
                  </div>
                  <div className="destacado">
                    <dt>Ahorro (ingresos − gastos)</dt>
                    <dd className={ahorro < 0 ? 'negativo' : ''}>{formatMonto(ahorro, moneda)}</dd>
                  </div>
                  {(t.aportes > 0 || t.rescates > 0) && (
                    <div>
                      <dt>Invertido neto (invertí − retiré)</dt>
                      <dd>{formatMonto(inversionNeta, moneda)}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )
          })}

          {porCategoria.length > 0 && (
            <section className="card">
              <div className="titulo-con-accion">
                <h2>Gastos por categoría</h2>
                {monedasConGastos.length > 1 && (
                  <div className="segmentado chico" role="group" aria-label="Moneda">
                    {monedasConGastos.map((m) => (
                      <button key={m} aria-pressed={monedaBarras === m} onClick={() => setMonedaGastos(m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <ul className="barras">
                {porCategoria.map((c) => {
                  const pct = totalGastos ? Math.round((c.total / totalGastos) * 100) : 0
                  return (
                    <li key={c.id}>
                      <div className="barra-etiqueta">
                        <span>{c.nombre}</span>
                        <span>
                          {formatMonto(c.total, monedaBarras)} <span className="muted">· {pct}%</span>
                        </span>
                      </div>
                      <div className="barra-pista" aria-hidden="true">
                        <div className="barra" style={{ width: `${maximo ? (c.total / maximo) * 100 : 0}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
      <BottomNav />
    </main>
  )
}
