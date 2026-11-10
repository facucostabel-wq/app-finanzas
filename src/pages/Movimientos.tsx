import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import Combobox, { type Opcion } from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import { Funnel } from 'lucide-react'
import { TEXTO_FORMA_PAGO, TEXTO_TIPO, TEXTO_TIPO_CUENTA, useActivos, useCategorias, nombreCuenta, useCuentas, useMovimientosDelMes, type Movimiento } from '../lib/datos'
import { supabase } from '../lib/supabase'
import { formatCantidad, formatMonto, formatPrecio, nombreDia, nombreMes } from '../lib/format'
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
  const hayFiltro = Boolean(filtroCategoria || filtroCuenta)
  const [verFiltros, setVerFiltros] = useState(hayFiltro)
  function cambiarFiltro(clave: 'categoria' | 'cuenta', valor: string) {
    const nuevos = new URLSearchParams(params)
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
  const opcionesCuenta: Opcion[] = [
    { valor: '', texto: 'Todas' },
    ...cuentas.map((c) => ({ valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] })),
  ]

  const filtrados = movimientos.filter(
    (m) =>
      (!filtroCategoria || m.categoria_id === filtroCategoria) &&
      (!filtroCuenta || m.cuenta_id === filtroCuenta || m.cuenta_destino_id === filtroCuenta),
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
        <h1>Movimientos</h1>
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
          <Combobox etiqueta="Cuenta" opciones={opcionesCuenta} valor={filtroCuenta} onCambio={(v) => cambiarFiltro('cuenta', v)} />
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
