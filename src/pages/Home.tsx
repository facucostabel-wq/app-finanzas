import { useState } from 'react'
import { Link } from 'react-router-dom'
import IconoCategoria from '../components/IconoCategoria'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import TarjetaObjetivo from '../components/TarjetaObjetivo'
import { useObjetivosConContexto } from '../lib/contextoObjetivos'
import { calcularPlan, calcularProgreso, reservadoEnDisponible } from '../lib/objetivos'
import {
  esCuentaDisponible,
  nombreCuenta,
  gastosPorCategoria,
  ordenarMonedas,
  totalesPorMoneda,
  useActivos,
  useCategorias,
  useCuentas,
  useCuotasFuturas,
  useMovimientosDelMes,
  useSaldosCuentas,
  useSaldosIniciales,
} from '../lib/datos'
import { formatMonto, mesActual, moverMes, nombreMes, rangoMes, type Moneda } from '../lib/format'
import { useMes } from '../lib/mes'
import { usePerfil } from '../lib/perfil'

const redondear = (n: number) => Math.round(n * 100) / 100

export default function Home() {
  const { perfil } = usePerfil()
  const { mes, setMes } = useMes()
  const { movimientos, loading, error } = useMovimientosDelMes(mes)
  const { categorias } = useCategorias()
  const { activos } = useActivos()
  const { cuentas, error: errorCuentas } = useCuentas()
  const { saldos: saldosCuentas, error: errorDisponible } = useSaldosCuentas(mes)
  const { saldos, loading: cargandoSaldos } = useSaldosIniciales()
  const [verCuentas, setVerCuentas] = useState(false)
  const cuotasFuturas = useCuotasFuturas(rangoMes(mes).hasta)
  const [monedaElegida, setMonedaElegida] = useState<Moneda | null>(null)
  const [verCalculo, setVerCalculo] = useState(false)
  const [verTodas, setVerTodas] = useState(false)
  const obj = useObjetivosConContexto()
  const mesAnterior = moverMes(mesActual(), -1)
  const [cierreOculto, setCierreOculto] = useState(() => {
    try {
      return localStorage.getItem('cierre_oculto') === mesAnterior
    } catch {
      return false
    }
  })

  const nombre = perfil?.nombre?.split(' ')[0]
  const favoritas = perfil?.monedas_favoritas ?? []
  const esMesActual = mes === mesActual()
  const nombreDelMes = nombreMes(mes).split(' ')[0]

  // Disponible = suma de bancos, billeteras y efectivo (sin tarjetas ni brokers).
  const tipoDe = new Map(cuentas.map((c) => [c.id, c.tipo]))
  const disponible = new Map<Moneda, number>()
  for (const s of saldosCuentas) {
    const tipo = tipoDe.get(s.cuenta_id)
    if (tipo && esCuentaDisponible(tipo)) disponible.set(s.moneda, (disponible.get(s.moneda) ?? 0) + s.monto)
  }
  // Lo destinado a objetivos no se puede gastar: sale del disponible (solo para el mes actual).
  const reservado = esMesActual
    ? reservadoEnDisponible(obj.objetivos, obj.vinculos, obj.aportes, cuentas, saldosCuentas)
    : new Map<Moneda, number>()
  for (const [m, v] of reservado) disponible.set(m, (disponible.get(m) ?? 0) - v)
  const monedasReservado = ordenarMonedas(
    [...reservado.entries()].filter(([, v]) => v >= 0.01).map(([m]) => m),
    favoritas,
  )
  const objetivosVigentes = obj.objetivos.filter((o) => o.estado === 'activo')
  const faltaCierre =
    !obj.loading && !cierreOculto && obj.cierres.every((c) => c.mes.slice(0, 7) !== mesAnterior) &&
    (obj.cierres.length > 0 || objetivosVigentes.length > 0 || obj.ctx.tenencias.some((x) => x.cantidad > 0))

  // Saldos por cuenta (para el detalle), solo los que no son cero.
  const futurasDe = (cuentaId: string) => cuotasFuturas.filter((f) => f.cuenta_id === cuentaId)
  const porCuenta = cuentas
    .map((c) => ({
      cuenta: c,
      saldos: ordenarMonedas(
        saldosCuentas.filter((s) => s.cuenta_id === c.id && Math.abs(s.monto) >= 0.01).map((s) => s.moneda),
        favoritas,
      ).map((m) => ({ moneda: m, monto: saldosCuentas.find((s) => s.cuenta_id === c.id && s.moneda === m)!.monto })),
    }))
    .filter((x) => x.saldos.length > 0 || futurasDe(x.cuenta.id).length > 0)
  const grupos: { titulo: string; filas: typeof porCuenta }[] = [
    { titulo: 'Para gastar', filas: porCuenta.filter((x) => esCuentaDisponible(x.cuenta.tipo)) },
    { titulo: 'Tarjetas', filas: porCuenta.filter((x) => x.cuenta.tipo === 'tarjeta') },
    { titulo: 'En brokers', filas: porCuenta.filter((x) => x.cuenta.tipo === 'broker') },
    { titulo: 'En grupos', filas: porCuenta.filter((x) => x.cuenta.tipo === 'grupo') },
  ].filter((g) => g.filas.length > 0)

  // Disponible: la moneda principal grande, el resto chico debajo.
  const monedasDisponible = ordenarMonedas(
    [...disponible.entries()].filter(([, v]) => Math.abs(v) >= 0.01).map(([m]) => m),
    favoritas,
  )
  const [principal, ...otras] = monedasDisponible
  const montoPrincipal = principal ? disponible.get(principal)! : 0

  // Resumen del mes: una moneda por vez.
  const totales = totalesPorMoneda(movimientos, activos, cuentas)
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
        <div className="topbar-izq">
          <BotonMenu />
          <p className="saludo">Hola{nombre ? `, ${nombre}` : ''}</p>
        </div>
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
            {monedasReservado.length > 0 && (
              <Link to="/objetivos" className="hero-reservado">
                Reservado para objetivos:{' '}
                {monedasReservado.map((m) => formatMonto(redondear(reservado.get(m)!), m)).join(' y ')} ›
              </Link>
            )}
            <div className="hero-acciones">
              {grupos.length > 0 && (
                <button className="link-discreto" onClick={() => setVerCuentas((v) => !v)} aria-expanded={verCuentas}>
                  {verCuentas ? 'Ocultar cuentas' : 'Ver por cuenta'}
                </button>
              )}
              <button className="link-discreto" onClick={() => setVerCalculo((v) => !v)} aria-expanded={verCalculo}>
                {verCalculo ? 'Ocultar cálculo' : '¿Cómo se calcula?'}
              </button>
            </div>
            {verCalculo && (
              <p className="nota">
                Es la suma de tus bancos, billeteras y efectivo: saldo inicial, más ingresos, menos gastos, menos lo
                invertido, más lo retirado. Los consumos con tarjeta descuentan recién cuando pagás el resumen, y la plata
                en brokers va aparte. Lo que destinaste a tus objetivos (apartado o en cuentas destinadas) no cuenta como
                disponible.
              </p>
            )}
            {verCuentas && (
              <div className="cuentas-detalle">
                {grupos.map((g) => (
                  <div key={g.titulo}>
                    <h3>{g.titulo}</h3>
                    <ul>
                      {g.filas.map(({ cuenta, saldos }) => (
                        <li key={cuenta.id}>
                          <Link
                            to={cuenta.tipo === 'grupo' && cuenta.grupo_id ? `/grupos/${cuenta.grupo_id}` : `/movimientos?cuenta=${cuenta.id}`}
                            className="cuenta-link"
                          >
                            {nombreCuenta(cuenta)} <span aria-hidden="true">›</span>
                          </Link>
                          <span className="cuentas-montos">
                            {saldos.map((x) => (
                              <span key={x.moneda} className={x.monto < 0 && cuenta.tipo !== 'tarjeta' && cuenta.tipo !== 'grupo' ? 'negativo' : ''}>
                                {(cuenta.tipo === 'tarjeta' || cuenta.tipo === 'grupo') && x.monto < 0
                                  ? `Debés ${formatMonto(redondear(-x.monto), x.moneda)}`
                                  : cuenta.tipo === 'grupo'
                                    ? `Te deben ${formatMonto(redondear(x.monto), x.moneda)}`
                                    : formatMonto(redondear(x.monto), x.moneda)}
                              </span>
                            ))}
                            {cuenta.tipo === 'tarjeta' &&
                              futurasDe(cuenta.id).map((f) => (
                                <span key={`f-${f.moneda}`} className="muted chico">
                                  y {formatMonto(redondear(f.monto), f.moneda)} en cuotas a vencer
                                </span>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {!cargandoSaldos && saldos.length === 0 && (
              <Link to="/ajustes/cuentas" className="aviso">
                Cargá tu saldo inicial en Ajustes para que este número refleje tu plata real.
              </Link>
            )}
          </>
        )}
      </section>

      {faltaCierre && (
        <div className="aviso-cierre">
          <Link to={`/cierre?mes=${mesAnterior}`}>
            <strong>Cerrá {nombreMes(mesAnterior).split(' ')[0].toLowerCase()}</strong>
            <span className="muted chico">Cotizaciones e inversiones al fin de mes, y tu resumen en dólares.</span>
          </Link>
          <button
            className="icono-quitar"
            aria-label="Ocultar"
            onClick={() => {
              try {
                localStorage.setItem('cierre_oculto', mesAnterior)
              } catch {
                /* nada */
              }
              setCierreOculto(true)
            }}
          >
            ✕
          </button>
        </div>
      )}

      {objetivosVigentes.length > 0 && (
        <section className="bloque objetivos-resumen" aria-labelledby="objetivos-titulo">
          <div className="titulo-con-accion">
            <h2 id="objetivos-titulo">Tus objetivos</h2>
            <Link to="/objetivos" className="link-discreto">
              Ver todos
            </Link>
          </div>
          {objetivosVigentes.slice(0, 3).map((o) => {
            const progreso = calcularProgreso(o, obj.vinculos, obj.aportes, obj.ctx)
            return (
              <TarjetaObjetivo key={o.id} obj={o} progreso={progreso} plan={calcularPlan(o, progreso, obj.aportes, obj.cierres)} compacta />
            )
          })}
        </section>
      )}

      {error && <p className="error">No se pudieron cargar los datos: {error}</p>}
      {errorCuentas && <p className="error">No se pudieron cargar las cuentas: {errorCuentas}</p>}

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
                    <Link to={`/movimientos?categoria=${c.id}`} className="categoria-link con-icono" aria-label={`Ver los gastos de ${c.nombre}`}>
                      <IconoCategoria nombre={c.nombre} tipo="gasto" icono={c.icono} />
                      <div className="categoria-cuerpo">
                      <div className="categoria-fila">
                        <span>
                          {c.nombre} <span className="categoria-flecha" aria-hidden="true">›</span>
                        </span>
                        <span className="categoria-monto">{formatMonto(c.total, moneda)}</span>
                      </div>
                      <div className="categoria-pista" aria-hidden="true">
                        <div className="categoria-barra" style={{ width: `${maximo ? (c.total / maximo) * 100 : 0}%` }} />
                      </div>
                      </div>
                    </Link>
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
