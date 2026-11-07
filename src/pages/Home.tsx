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
import { formatMonto, mesActual, moverMes, nombreMes, type Moneda } from '../lib/format'
import { useMes } from '../lib/mes'
import { usePerfil } from '../lib/perfil'

const redondear = (n: number) => Math.round(n * 100) / 100

export default function Home() {
  const { perfil } = usePerfil()
  const { mes, setMes } = useMes()
  const { movimientos, loading, error } = useMovimientosDelMes(mes)
  const { categorias } = useCategorias()
  const { activos } = useActivos()
  const { disponible, error: errorDisponible } = useDisponible(mes)
  const { saldos, loading: cargandoSaldos } = useSaldosIniciales()
  const [monedaElegida, setMonedaElegida] = useState<Moneda | null>(null)
  const [verCalculo, setVerCalculo] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  const nombre = perfil?.nombre?.split(' ')[0]
  const favoritas = perfil?.monedas_favoritas ?? []
  const esMesActual = mes === mesActual()
  const nombreDelMes = nombreMes(mes).split(' ')[0]

  // Disponible: la moneda principal grande, el resto chico debajo.
  const monedasDisponible = ordenarMonedas(
    [...disponible.entries()].filter(([, v]) => Math.abs(v) >= 0.01).map(([m]) => m),
    favoritas,
  )
  const [principal, ...otras] = monedasDisponible
  const montoPrincipal = principal ? disponible.get(principal)! : 0

  // Resumen del mes: una moneda por vez.
  const totales = totalesPorMoneda(movimientos, activos)
  const monedasMes = ordenarMonedas(totales.keys(), favoritas)
  const moneda: Moneda = monedaElegida && monedasMes.includes(monedaElegida) ? monedaElegida : (monedasMes[0] ?? 'ARS')
  const t = totales.get(moneda)
  const quedaron = t ? t.ingresos - t.gastos : 0
  const proporcion = t && t.ingresos > 0 ? Math.min(t.gastos / t.ingresos, 1) : null
  const hayDetalle = t && (t.aportes || t.rescates || t.usadoEnDivisas || t.pagosTarjeta)

  const porCategoria = gastosPorCategoria(movimientos, moneda, categorias)
  const visibles = verTodas ? porCategoria : porCategoria.slice(0, 5)
  const maximo = porCategoria[0]?.total ?? 0

  return (
    <main className="screen con-nav resumen">
      <header className="resumen-cabecera">
        <p className="saludo">Hola{nombre ? `, ${nombre}` : ''}</p>
        <div className="mes-nav">
          <button onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">
            ‹
          </button>
          <span>{nombreMes(mes)}</span>
          <button onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente" disabled={esMesActual}>
            ›
          </button>
        </div>
      </header>

      {/* 1. Lo más importante: cuánto puedo gastar. */}
      <section className="hero" aria-labelledby="disponible-titulo">
        <h1 id="disponible-titulo" className="hero-etiqueta">
          {esMesActual ? 'Disponible para gastar' : `Disponible al cierre de ${nombreDelMes.toLowerCase()}`}
        </h1>
        {errorDisponible ? (
          <p className="muted">Falta ejecutar el SQL del dinero disponible en Supabase.</p>
        ) : (
          <>
            <p className={`hero-monto ${montoPrincipal < 0 ? 'negativo' : ''}`}>
              {principal ? formatMonto(redondear(montoPrincipal), principal) : '$ 0'}
            </p>
            {otras.length > 0 && (
              <p className="hero-otras">
                {otras.map((m) => (
                  <span key={m}>y {formatMonto(redondear(disponible.get(m)!), m)}</span>
                ))}
              </p>
            )}
            <button className="link-discreto" onClick={() => setVerCalculo((v) => !v)} aria-expanded={verCalculo}>
              {verCalculo ? 'Ocultar cálculo' : '¿Cómo se calcula?'}
            </button>
            {verCalculo && (
              <p className="nota">
                Saldo inicial, más ingresos, menos gastos pagados en el momento (la tarjeta de crédito descuenta cuando
                pagás el resumen), menos lo invertido, más lo retirado.
              </p>
            )}
            {!cargandoSaldos && saldos.size === 0 && (
              <Link to="/ajustes" className="aviso">
                Cargá tu saldo inicial en Ajustes para que este número refleje tu plata real.
              </Link>
            )}
          </>
        )}
      </section>

      {error && <p className="error">No se pudieron cargar los datos: {error}</p>}

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : !t ? (
        <section className="bloque vacio">
          <p>Todavía no hay movimientos en {nombreDelMes.toLowerCase()}.</p>
          <Link to="/nuevo" className="primary boton">
            Cargar el primero
          </Link>
        </section>
      ) : (
        <>
          {/* 2. El mes: ingresos, gastos y lo que quedó. */}
          <section className="bloque mes" aria-labelledby="mes-titulo">
            <div className="bloque-cabecera">
              <h2 id="mes-titulo">{nombreDelMes}</h2>
              {monedasMes.length > 1 && (
                <div className="segmentado chico" role="group" aria-label="Moneda del resumen">
                  {monedasMes.map((m) => (
                    <button key={m} aria-pressed={moneda === m} onClick={() => setMonedaElegida(m)}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flujo">
              <div>
                <span className="flujo-etiqueta">Ingresos</span>
                <span className="flujo-monto">{formatMonto(t.ingresos, moneda)}</span>
              </div>
              <div>
                <span className="flujo-etiqueta">Gastos</span>
                <span className="flujo-monto">{formatMonto(t.gastos, moneda)}</span>
                {t.gastosCredito > 0 && (
                  <span className="flujo-sub">{formatMonto(t.gastosCredito, moneda)} con tarjeta</span>
                )}
              </div>
            </div>

            {proporcion !== null && (
              <div className="proporcion">
                <div className="proporcion-pista" aria-hidden="true">
                  <div className="proporcion-barra" style={{ width: `${proporcion * 100}%` }} />
                </div>
                <p className="flujo-sub">Gastaste el {Math.round(proporcion * 100)}% de lo que ingresó</p>
              </div>
            )}

            <div className="quedaron">
              <span>Te quedaron</span>
              <strong className={quedaron < 0 ? 'negativo' : ''}>{formatMonto(redondear(quedaron), moneda)}</strong>
            </div>

            {hayDetalle ? (
              <details className="detalle">
                <summary>Más detalle del mes</summary>
                <dl>
                  {(t.aportes > 0 || t.rescates > 0) && (
                    <div>
                      <dt>Invertido (neto)</dt>
                      <dd>{formatMonto(redondear(t.aportes - t.rescates), moneda)}</dd>
                    </div>
                  )}
                  {t.usadoEnDivisas !== 0 && (
                    <div>
                      <dt>Usado para comprar moneda extranjera</dt>
                      <dd>{formatMonto(redondear(t.usadoEnDivisas), moneda)}</dd>
                    </div>
                  )}
                  {t.pagosTarjeta > 0 && (
                    <div>
                      <dt>Pagos de tarjeta</dt>
                      <dd>{formatMonto(t.pagosTarjeta, moneda)}</dd>
                    </div>
                  )}
                </dl>
              </details>
            ) : null}
          </section>

          {/* 3. En qué se fue la plata. */}
          {porCategoria.length > 0 && (
            <section className="bloque-plano" aria-labelledby="cat-titulo">
              <h2 id="cat-titulo">En qué gastaste</h2>
              <ul className="categorias">
                {visibles.map((c) => (
                  <li key={c.id}>
                    <div className="categoria-fila">
                      <span>{c.nombre}</span>
                      <span className="categoria-monto">{formatMonto(c.total, moneda)}</span>
                    </div>
                    <div className="categoria-pista" aria-hidden="true">
                      <div className="categoria-barra" style={{ width: `${maximo ? (c.total / maximo) * 100 : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              {porCategoria.length > 5 && (
                <button className="link-discreto" onClick={() => setVerTodas((v) => !v)}>
                  {verTodas ? 'Ver menos' : `Ver las ${porCategoria.length} categorías`}
                </button>
              )}
            </section>
          )}
        </>
      )}
      <BottomNav />
    </main>
  )
}
