import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import Combobox, { type Opcion } from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import { Funnel } from 'lucide-react'
import { TEXTO_FORMA_PAGO, TEXTO_TIPO, TEXTO_TIPO_CUENTA, useActivos, useCategorias, nombreCuenta, useCuentas, useMovimientosDelMes, useSaldosCuentas, type Movimiento } from '../lib/datos'
import { supabase } from '../lib/supabase'
import { formatCantidad, formatMonto, formatPrecio, mesActual, nombreDia, nombreMes } from '../lib/format'
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
  for (const m of filtrados) {
    const ultimo = dias[dias.length - 1]
    if (ultimo?.fecha === m.fecha) ultimo.items.push(m)
    else dias.push({ fecha: m.fecha, items: [m] })
  }

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
        <p className="muted">{hayFiltro ? 'No hay movimientos con ese filtro en este mes.' : 'No hay movimientos en este mes.'}</p>
      ) : (
        dias.map((d) => (
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
        ))
      )}
      <BottomNav />
    </main>
  )
}
