import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import Combobox, { type Opcion } from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import { CalendarDays, Funnel, List } from 'lucide-react'
import { TEXTO_FORMA_PAGO, TEXTO_TIPO, TEXTO_TIPO_CUENTA, useActivos, useCategorias, nombreCuenta, useCuentas, useMovimientosDelMes, useSaldosCuentas, type Movimiento } from '../lib/datos'
import { supabase } from '../lib/supabase'
import { formatCantidad, formatMonto, formatPrecio, hoyISO, mesActual, nombreDia, nombreMes } from '../lib/format'
import { usePerfil } from '../lib/perfil'
import { nombreCortoMoneda } from '../lib/monedas'
import { SelectorMes, useMes } from '../lib/mes'

const SIGNO: Record<Movimiento['tipo'], string> = { gasto: '−', ingreso: '+', aporte: '→', rescate: '←', transferencia: '⇄' }

export default function Movimientos() {
  const { mes } = useMes()
  const { movimientos, loading, error } = useMovimientosDelMes(mes)
  const { categorias } = useCategorias()
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]))
  const iconos = new Map(categorias.map((c) => [c.id, c.icono]))
  const { activos } = useActivos()
  const { cuentas } = useCuentas()
  const { saldos: saldosHoy } = useSaldosCuentas(mesActual())
  const cuenta = new Map(cuentas.map((c) => [c.id, c]))
  // Total de cuotas de cada compra, para mostrar "cuota 2 de 6".
  const [totalCuotas, setTotalCuotas] = useState<Map<string, number>>(new Map())
  useEffect(() => {
    supabase
      .from('compras_cuotas')
      .select('id, cuotas')
      .then(({ data }) => setTotalCuotas(new Map((data ?? []).map((c) => [c.id as string, c.cuotas as number]))))
  }, [])
  const nombresActivo = new Map(activos.map((a) => [a.id, a.nombre]))

  // Filtros por categoría y por cuenta (vienen en la URL, así se puede llegar desde el resumen).
  const [params, setParams] = useSearchParams()
  const filtroCategoria = params.get('categoria') ?? ''
  const filtroCuenta = params.get('cuenta') ?? ''
  const filtroMoneda = filtroCuenta ? (params.get('moneda') ?? '') : ''
  const hayFiltro = Boolean(filtroCategoria || filtroCuenta)
  // Vista lista o calendario (se recuerda en el dispositivo).
  const [vista, setVista] = useState<'lista' | 'calendario'>(() => {
    try {
      return localStorage.getItem('vista_movimientos') === 'calendario' ? 'calendario' : 'lista'
    } catch {
      return 'lista'
    }
  })
  const cambiarVista = (v: 'lista' | 'calendario') => {
    setVista(v)
    try {
      localStorage.setItem('vista_movimientos', v)
    } catch {
      /* nada */
    }
  }
  const [diaElegido, setDiaElegido] = useState<string | null>(null)
  const { perfil } = usePerfil()
  const [verFiltros, setVerFiltros] = useState(hayFiltro)
  function cambiarFiltro(clave: 'categoria' | 'cuenta', valor: string) {
    const nuevos = new URLSearchParams(params)
    if (clave === 'cuenta') {
      // "id|USD" = una moneda de la cuenta; "id" = la cuenta entera.
      const [id, moneda] = valor.split('|')
      nuevos.delete('moneda')
      if (moneda) nuevos.set('moneda', moneda)
      valor = id
    }
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }

  const opcionesCategoria: Opcion[] = [
    { valor: '', texto: 'Todas' },
    ...categorias.map((c) => ({
      valor: c.id,
      texto: c.nombre,
      grupo: c.tipo === 'gasto' ? 'Gastos' : c.tipo === 'ingreso' ? 'Ingresos' : 'Inversiones',
    })),
  ]
  // Monedas de cada cuenta (por saldo o por movimientos del mes), para filtrar por una sola.
  const monedasDe = new Map<string, Set<string>>()
  const sumarMoneda = (id: string | null, m: string) => {
    if (!id) return
    if (!monedasDe.has(id)) monedasDe.set(id, new Set())
    monedasDe.get(id)!.add(m)
  }
  for (const x of saldosHoy) if (Math.abs(x.monto) >= 0.01) sumarMoneda(x.cuenta_id, x.moneda)
  for (const m of movimientos) {
    sumarMoneda(m.cuenta_id, m.moneda)
    sumarMoneda(m.cuenta_destino_id, m.moneda)
  }
  const opcionesCuenta: Opcion[] = [
    { valor: '', texto: 'Todas' },
    ...cuentas.flatMap((c) => {
      const monedas = [...(monedasDe.get(c.id) ?? [])].sort()
      const entera = { valor: c.id, texto: nombreCuenta(c), detalle: monedas.length > 1 ? 'Todas las monedas' : TEXTO_TIPO_CUENTA[c.tipo] }
      if (monedas.length <= 1) return [entera]
      return [
        entera,
        ...monedas.map((m) => ({ valor: `${c.id}|${m}`, texto: `${nombreCuenta(c)} · ${nombreCortoMoneda(m)}`, detalle: m })),
      ]
    }),
  ]

  const filtrados = movimientos.filter(
    (m) =>
      (!filtroCategoria || m.categoria_id === filtroCategoria) &&
      (!filtroCuenta || m.cuenta_id === filtroCuenta || m.cuenta_destino_id === filtroCuenta) &&
      (!filtroMoneda || m.moneda === filtroMoneda),
  )

  // Totales de lo filtrado, por moneda: lo que entró y lo que salió.
  const totales = new Map<string, { entra: number; sale: number }>()
  for (const m of filtrados) {
    const t = totales.get(m.moneda) ?? { entra: 0, sale: 0 }
    const entra =
      m.tipo === 'ingreso' || m.tipo === 'rescate' || (m.tipo === 'transferencia' && filtroCuenta && m.cuenta_destino_id === filtroCuenta)
    if (m.tipo === 'transferencia' && !filtroCuenta) continue
    if (entra) t.entra += m.monto
    else t.sale += m.monto
    totales.set(m.moneda, t)
  }

  const tituloMov = (m: Movimiento) =>
    m.categoria_id
      ? (nombres.get(m.categoria_id) ?? '—')
      : cuenta.get(m.cuenta_destino_id ?? '')?.tipo === 'tarjeta'
        ? 'Pago de tarjeta'
        : 'Transferencia'

  // Agrupa por día (ya vienen ordenados del más reciente al más viejo).
  const dias: { fecha: string; items: Movimiento[] }[] = []
  const porFecha = new Map<string, Movimiento[]>()
  for (const m of filtrados) {
    if (!porFecha.has(m.fecha)) {
      porFecha.set(m.fecha, [])
      dias.push({ fecha: m.fecha, items: porFecha.get(m.fecha)! })
    }
    porFecha.get(m.fecha)!.push(m)
  }

  const renderDia = (d: { fecha: string; items: Movimiento[] }) => (
          <section key={d.fecha} className="dia">
            <h2 className="dia-titulo">{nombreDia(d.fecha)}</h2>
            <ul className="lista card">
              {d.items.map((m) => (
                <li key={m.id}>
                  <Link to={`/movimiento/${m.id}`} className="fila fila-mov">
                    <IconoCategoria nombre={tituloMov(m)} tipo={m.tipo} icono={m.categoria_id ? iconos.get(m.categoria_id) : null} />
                    <div className="mov-texto">
                      <div className="mov-titulo">
                        {tituloMov(m)}
                        {m.activo_id && <span className="muted"> · {nombresActivo.get(m.activo_id)}</span>}
                      </div>
                      <div className="muted chico mov-detalle">
                        {m.tipo === 'transferencia'
                          ? `${cuenta.get(m.cuenta_id) ? nombreCuenta(cuenta.get(m.cuenta_id)!) : '—'} → ${cuenta.get(m.cuenta_destino_id ?? '') ? nombreCuenta(cuenta.get(m.cuenta_destino_id!)!) : '—'}`
                          : ((cuenta.get(m.cuenta_id) && nombreCuenta(cuenta.get(m.cuenta_id)!)) ??
                            (m.forma_pago ? TEXTO_FORMA_PAGO[m.forma_pago] : TEXTO_TIPO[m.tipo]))}
                        {m.cuota_n && m.compra_id
                          ? `, cuota ${m.cuota_n}${totalCuotas.get(m.compra_id) ? ` de ${totalCuotas.get(m.compra_id)}` : ''}`
                          : ''}
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
  )

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Movimientos</h1>
        </div>
        <button
          type="button"
          className={`boton-icono ${hayFiltro || verFiltros ? 'activo' : ''}`}
          onClick={() => setVerFiltros((v) => !v)}
          aria-expanded={verFiltros}
          aria-label={hayFiltro ? 'Filtros (hay un filtro activo)' : 'Filtrar'}
        >
          <Funnel size={20} strokeWidth={1.9} />
          {hayFiltro && <span className="punto" aria-hidden="true" />}
        </button>
      </header>
      <SelectorMes />
      <div className="segmentado chico vista-mov" role="group" aria-label="Vista">
        <button aria-pressed={vista === 'lista'} onClick={() => cambiarVista('lista')}>
          <List size={16} aria-hidden="true" /> Lista
        </button>
        <button aria-pressed={vista === 'calendario'} onClick={() => cambiarVista('calendario')}>
          <CalendarDays size={16} aria-hidden="true" /> Calendario
        </button>
      </div>

      {verFiltros && (
        <section className="card filtros">
          <Combobox etiqueta="Categoría" opciones={opcionesCategoria} valor={filtroCategoria} onCambio={(v) => cambiarFiltro('categoria', v)} />
          <Combobox
            etiqueta="Cuenta"
            opciones={opcionesCuenta}
            valor={filtroMoneda ? `${filtroCuenta}|${filtroMoneda}` : filtroCuenta}
            onCambio={(v) => cambiarFiltro('cuenta', v)}
          />
          {hayFiltro && (
            <button type="button" className="link" onClick={() => setParams({}, { replace: true })}>
              Quitar filtros
            </button>
          )}
        </section>
      )}

      {hayFiltro && !loading && (
        <section className="filtro-resumen" aria-live="polite">
          <p className="muted chico">
            {filtrados.length === 1 ? '1 movimiento' : `${filtrados.length} movimientos`} en {nombreMes(mes).toLowerCase()}
          </p>
          {[...totales.entries()].map(([moneda, t]) => (
            <p key={moneda} className="filtro-totales">
              {t.sale > 0 && <span className="monto gasto">− {formatMonto(t.sale, moneda)}</span>}
              {t.entra > 0 && <span className="monto ingreso">+ {formatMonto(t.entra, moneda)}</span>}
            </p>
          ))}
        </section>
      )}

      {error && <p className="error">No se pudieron cargar los movimientos: {error}</p>}
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : dias.length === 0 ? (
        vista === 'lista' || !dias.length ? (
          <p className="muted">{hayFiltro ? 'No hay movimientos con ese filtro en este mes.' : 'No hay movimientos en este mes.'}</p>
        ) : null
      ) : (
        vista === 'lista' ? (
          dias.map((d) => renderDia(d))
        ) : (
          <Calendario
            mes={mes}
            movimientos={filtrados}
            moneda={perfil?.monedas_favoritas?.[0] ?? 'ARS'}
            elegido={diaElegido}
            onElegir={(f) => setDiaElegido(f === diaElegido ? null : f)}
          >
            {diaElegido && (dias.find((d) => d.fecha === diaElegido) ? renderDia(dias.find((d) => d.fecha === diaElegido)!) : <p className="muted">Sin movimientos ese día.</p>)}
          </Calendario>
        )
      )}
      <BottomNav />
    </main>
  )
}

const corto = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n))

/** El mes en grilla: lo gastado cada día (más intenso, más gasto) y un punto si hubo ingresos. */
function Calendario(props: {
  mes: string
  movimientos: Movimiento[]
  moneda: string
  elegido: string | null
  onElegir: (fecha: string) => void
  children: React.ReactNode
}) {
  const { mes, movimientos, moneda, elegido, onElegir, children } = props
  const [y, m] = mes.split('-').map(Number)
  const diasMes = new Date(y, m, 0).getDate()
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7 // lunes primero
  const gasto = new Map<string, number>()
  const otras = new Set<string>()
  const ingreso = new Set<string>()
  for (const x of movimientos) {
    if (x.tipo === 'gasto') {
      if (x.moneda === moneda) gasto.set(x.fecha, (gasto.get(x.fecha) ?? 0) + x.monto)
      else otras.add(x.fecha)
    }
    if (x.tipo === 'ingreso') ingreso.add(x.fecha)
  }
  const max = Math.max(0, ...gasto.values())
  const total = [...gasto.values()].reduce((a, b) => a + b, 0)
  const hoy = hoyISO()
  const celdas: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)]
  return (
    <section className="calendario">
      <div className="calendario-grilla" role="grid" aria-label={`Gastos de ${nombreMes(mes)}`}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span key={i} className="calendario-dia-semana" aria-hidden="true">
            {d}
          </span>
        ))}
        {celdas.map((f, i) => {
          if (!f) return <span key={`v${i}`} />
          const g = gasto.get(f) ?? 0
          const intensidad = max ? g / max : 0
          return (
            <button
              key={f}
              className={`calendario-celda ${f === elegido ? 'elegida' : ''} ${f === hoy ? 'hoy' : ''} ${f > hoy ? 'futura' : ''}`}
              style={g ? { background: `color-mix(in srgb, var(--accent) ${Math.round(10 + intensidad * 45)}%, transparent)` } : undefined}
              onClick={() => onElegir(f)}
              aria-label={`${nombreDia(f)}: ${g ? formatMonto(g, moneda) : 'sin gastos'}`}
              aria-pressed={f === elegido}
            >
              <span className="calendario-numero">{Number(f.slice(8))}</span>
              <span className="calendario-monto">{g ? corto(g) : ''}</span>
              <span className="calendario-puntos" aria-hidden="true">
                {ingreso.has(f) && <i className="punto-ingreso" />}
                {otras.has(f) && <i className="punto-otra" />}
              </span>
            </button>
          )
        })}
      </div>
      <p className="muted chico calendario-leyenda">
        Gastos en {moneda} por día ({formatMonto(total, moneda)} en el mes). <i className="punto-ingreso" /> ingreso{' '}
        <i className="punto-otra" /> gasto en otra moneda. Tocá un día para ver el detalle.
      </p>
      {children}
    </section>
  )
}
