import { useState } from 'react'
import { Link } from 'react-router-dom'
import IconoCategoria from '../components/IconoCategoria'
import BottomNav from '../components/BottomNav'
import { TriangleAlert } from 'lucide-react'
import { Aviso } from '../lib/avisos'
import { BotonOjo, Oculto } from '../lib/ocultar'
import BotonMenu from '../components/BotonMenu'
import TarjetaObjetivo from '../components/TarjetaObjetivo'
import BarraPresupuesto from '../components/BarraPresupuesto'
import { useTiposHoy } from '../lib/cotizaciones'
import { estadoPresupuestos, usePresupuestos } from '../lib/presupuestos'
import { usePatrimonio } from '../lib/patrimonio'
import { Landmark } from 'lucide-react'
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
import { nombreCortoMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'

const redondear = (n: number) => Math.round(n * 100) / 100

function textoSaldo(tipo: string, monto: number, moneda: Moneda) {
  if ((tipo === 'tarjeta' || tipo === 'grupo') && monto < 0) return `Debés ${formatMonto(redondear(-monto), moneda)}`
  if (tipo === 'grupo') return `Te deben ${formatMonto(redondear(monto), moneda)}`
  return formatMonto(redondear(monto), moneda)
}

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
  const { presupuestos } = usePresupuestos()
  const patri = usePatrimonio()
  const patriPrevio = patri.puntos.length > 1 ? patri.puntos[patri.puntos.length - 2] : null
  const patriDif = patri.hoy && patriPrevio && Math.abs(patriPrevio.total) > 0.005 ? ((patri.hoy.total - patriPrevio.total) / Math.abs(patriPrevio.total)) * 100 : null
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

  // Neto de todas las cuentas: lo que tenés menos lo que debés (tarjetas en negativo),
  // incluidos brokers y grupos. Por moneda, al cierre del mes que estás mirando.
  const netoPorMoneda = new Map<Moneda, number>()
  for (const s of saldosCuentas) netoPorMoneda.set(s.moneda, (netoPorMoneda.get(s.moneda) ?? 0) + s.monto)
  const monedasNeto = ordenarMonedas(
    [...netoPorMoneda.entries()].filter(([, v]) => Math.abs(v) >= 0.01).map(([m]) => m),
    favoritas,
  )
  const negativas = porCuenta.filter(
    (x) => x.cuenta.tipo !== 'tarjeta' && x.cuenta.tipo !== 'grupo' && x.saldos.some((y) => y.monto < -0.005),
  )
  const hayCuotasFuturas = cuentas.some((c) => c.tipo === 'tarjeta' && futurasDe(c.id).length > 0)

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

  // Presupuestos del mes que se está mirando: el general primero, después de más a menos usado.
  const tiposPresu = useTiposHoy(['USD', ...presupuestos.map((p) => p.moneda), ...movimientos.map((m) => m.moneda)])
  const estados = estadoPresupuestos(presupuestos, movimientos, tiposPresu).sort(
    (a, b) =>
      Number(a.presupuesto.categoria_id !== null) - Number(b.presupuesto.categoria_id !== null) || (b.uso ?? 0) - (a.uso ?? 0),
  )
  const nombreCategoria = new Map(categorias.map((c) => [c.id, c]))

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
        <div className="hero-titulo">
          <h1 id="disponible-titulo" className="hero-etiqueta">
            {esMesActual ? 'Disponible para gastar' : `Disponible al cierre de ${nombreDelMes.toLowerCase()}`}
          </h1>
          <BotonOjo />
        </div>
        {errorDisponible ? (
          <p className="muted">Falta ejecutar el SQL del dinero disponible en Supabase.</p>
        ) : (
          <>
            <p className={`hero-monto ${montoPrincipal < 0 ? 'negativo' : ''}`}>
              <Oculto>{principal ? formatMonto(redondear(montoPrincipal), principal) : '$ 0'}</Oculto>
            </p>
            {otras.length > 0 && (
              <p className="hero-otras">
                {otras.map((m) => (
                  <span key={m}>
                    y <Oculto>{formatMonto(redondear(disponible.get(m)!), m)}</Oculto>
                  </span>
                ))}
              </p>
            )}
            {monedasReservado.length > 0 && (
              <Link to="/objetivos" className="hero-reservado">
                Reservado para objetivos:{' '}
                <Oculto>{monedasReservado.map((m) => formatMonto(redondear(reservado.get(m)!), m)).join(' y ')}</Oculto> ›
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
                        <li key={cuenta.id} className={saldos.length > 1 ? 'cuenta-multi' : ''}>
                          <div className="cuenta-renglon">
                            <Link
                              to={cuenta.tipo === 'grupo' && cuenta.grupo_id ? `/grupos/${cuenta.grupo_id}` : `/movimientos?cuenta=${cuenta.id}`}
                              className="cuenta-link"
                            >
                              {nombreCuenta(cuenta)}
                              {cuenta.tipo !== 'tarjeta' && cuenta.tipo !== 'grupo' && saldos.some((x) => x.monto < -0.005) && (
                                <span className="icono-alerta" title="Saldo negativo: revisá sus movimientos o el saldo inicial">
                                  <TriangleAlert size={15} strokeWidth={2.2} aria-label="Saldo negativo" />
                                </span>
                              )}{' '}
                              <span aria-hidden="true">›</span>
                            </Link>
                            {saldos.length <= 1 && (
                              <span className="cuentas-montos">
                                {saldos.map((x) => (
                                  <span key={x.moneda} className={x.monto < 0 && cuenta.tipo !== 'tarjeta' && cuenta.tipo !== 'grupo' ? 'negativo' : ''}>
                                    <Oculto>{textoSaldo(cuenta.tipo, x.monto, x.moneda)}</Oculto>
                                  </span>
                                ))}
                              </span>
                            )}
                          </div>
                          {/* Una cuenta con varias monedas se abre en una fila por moneda. */}
                          {saldos.length > 1 &&
                            saldos.map((x) => (
                              <Link
                                key={x.moneda}
                                to={
                                  cuenta.tipo === 'grupo' && cuenta.grupo_id
                                    ? `/grupos/${cuenta.grupo_id}`
                                    : `/movimientos?cuenta=${cuenta.id}&moneda=${x.moneda}`
                                }
                                className="cuenta-sub"
                              >
                                <span>{nombreCortoMoneda(x.moneda)}</span>
                                <span className={x.monto < 0 && cuenta.tipo !== 'tarjeta' && cuenta.tipo !== 'grupo' ? 'negativo' : ''}>
                                  <Oculto>{textoSaldo(cuenta.tipo, x.monto, x.moneda)}</Oculto>
                                </span>
                              </Link>
                            ))}
                          {cuenta.tipo === 'tarjeta' &&
                            futurasDe(cuenta.id).map((f) => (
                              <span key={`f-${f.moneda}`} className="muted chico cuenta-cuotas">
                                y <Oculto>{formatMonto(redondear(f.monto), f.moneda)}</Oculto> en cuotas a vencer
                              </span>
                            ))}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {negativas.length > 0 && (
                  <Aviso>
                    {negativas.map((x) => nombreCuenta(x.cuenta)).join(', ')} {negativas.length === 1 ? 'tiene' : 'tienen'} saldo
                    negativo: suele ser un saldo inicial mal cargado o un ingreso sin anotar. Tocá la cuenta para revisar sus
                    movimientos.
                  </Aviso>
                )}
                {monedasNeto.length > 0 && (
                  <div className="neto-cuentas">
                    <div className="neto-fila">
                      <span>Neto de todas tus cuentas</span>
                      <span className="neto-montos">
                        {monedasNeto.map((m) => (
                          <strong key={m} className={netoPorMoneda.get(m)! < 0 ? 'negativo' : ''}>
                            <Oculto>{formatMonto(redondear(netoPorMoneda.get(m)!), m)}</Oculto>
                          </strong>
                        ))}
                      </span>
                    </div>
                    <p className="muted chico">
                      Lo que tenés en todas las cuentas (incluidos brokers y grupos) menos lo que debés de tarjetas
                      {hayCuotasFuturas ? '. No incluye las cuotas a vencer' : ''}.
                    </p>
                  </div>
                )}
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

      {esMesActual && patri.hoy && (
        <Link to="/patrimonio" className="tarjeta-patrimonio">
          <span className="tarjeta-patrimonio-icono" aria-hidden="true">
            <Landmark size={20} />
          </span>
          <span className="tarjeta-patrimonio-texto">
            <span className="muted chico">Patrimonio</span>
            <strong>
              <Oculto>{formatMonto(Math.round(patri.hoy.total * 100) / 100, 'USD')}</Oculto>
            </strong>
          </span>
          {patriDif !== null && (
            <span className={`chico ${patriDif >= 0 ? 'positivo' : 'negativo'}`}>
              {patriDif >= 0 ? '▲' : '▼'} {Math.abs(patriDif).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
              <span className="muted"> vs {nombreMes(patriPrevio!.mes).split(' ')[0].toLowerCase().slice(0, 3)}</span>
            </span>
          )}
          <span className="menu-flecha" aria-hidden="true">
            ›
          </span>
        </Link>
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
                <span className="flujo-monto"><Oculto>{formatMonto(t.ingresos, moneda)}</Oculto></span>
              </div>
              <div>
                <span className="flujo-etiqueta">Gastos</span>
                <span className="flujo-monto"><Oculto>{formatMonto(t.gastos, moneda)}</Oculto></span>
                {t.gastosCredito > 0 && (
                  <span className="flujo-sub"><Oculto>{formatMonto(t.gastosCredito, moneda)}</Oculto> con tarjeta</span>
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
              <strong className={quedaron < 0 ? 'negativo' : ''}><Oculto>{formatMonto(redondear(quedaron), moneda)}</Oculto></strong>
            </div>

            {hayDetalle ? (
              <details className="detalle">
                <summary>Más detalle del mes</summary>
                <dl>
                  {(t.aportes > 0 || t.rescates > 0) && (
                    <div>
                      <dt>Invertido (neto)</dt>
                      <dd><Oculto>{formatMonto(redondear(t.aportes - t.rescates), moneda)}</Oculto></dd>
                    </div>
                  )}
                  {t.usadoEnDivisas !== 0 && (
                    <div>
                      <dt>Usado para comprar moneda extranjera</dt>
                      <dd><Oculto>{formatMonto(redondear(t.usadoEnDivisas), moneda)}</Oculto></dd>
                    </div>
                  )}
                  {t.pagosTarjeta > 0 && (
                    <div>
                      <dt>Pagos de tarjeta</dt>
                      <dd><Oculto>{formatMonto(t.pagosTarjeta, moneda)}</Oculto></dd>
                    </div>
                  )}
                </dl>
              </details>
            ) : null}
          </section>

          {/* Presupuestos del mes */}
          {estados.length > 0 && (
            <section className="bloque-plano presupuestos-resumen" aria-labelledby="presu-titulo">
              <div className="titulo-con-accion">
                <h2 id="presu-titulo">Presupuestos</h2>
                <Link to="/presupuestos" className="link-discreto">
                  Editar
                </Link>
              </div>
              <ul>
                {estados.map((e) => {
                  const cat = e.presupuesto.categoria_id ? nombreCategoria.get(e.presupuesto.categoria_id) : null
                  return (
                    <li key={e.presupuesto.id}>
                      <Link
                        to={cat ? `/movimientos?categoria=${cat.id}` : '/movimientos'}
                        className="presupuesto-resumen-fila"
                      >
                        {cat ? (
                          <IconoCategoria nombre={cat.nombre} tipo="gasto" icono={cat.icono} />
                        ) : (
                          <span className="presupuesto-general" aria-hidden="true">
                            Σ
                          </span>
                        )}
                        <div className="categoria-cuerpo">
                          <span>{cat ? cat.nombre : 'General'}</span>
                          <BarraPresupuesto estado={e} />
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* 3. En qué se fue la plata. */}
          {porCategoria.length > 0 && (
            <section className="bloque-plano" aria-labelledby="cat-titulo">
              <div className="titulo-con-accion">
                <h2 id="cat-titulo">En qué gastaste</h2>
                {estados.length === 0 && (
                  <Link to="/presupuestos" className="link-discreto">
                    Poner presupuestos
                  </Link>
                )}
              </div>
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
                        <span className="categoria-monto"><Oculto>{formatMonto(c.total, moneda)}</Oculto></span>
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
