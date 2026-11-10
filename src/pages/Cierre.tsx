import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import { useObjetivosConContexto } from '../lib/contextoObjetivos'
import { convertir, idCripto, traerCripto, traerTipos, type Cierre as CierreT, type Tipos } from '../lib/cotizaciones'
import { totalesPorMoneda, useMovimientosDelMes, useSaldosCuentas } from '../lib/datos'
import { formatCantidad, formatMonto, formatPrecio, mesActual, montoAEditable, moverMes, nombreMes, parseNumero, rangoMes, type Moneda } from '../lib/format'
import { calcularProgreso } from '../lib/objetivos'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'
import { calcularTenencias } from '../lib/tenencias'
import { useInversiones } from '../lib/datos'
import InputNumero from '../components/InputNumero'

type Fuente = 'auto' | 'manual'
const parsePrecio = (t: string) => parseNumero(t, 8)

export default function Cierre() {
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? moverMes(mesActual(), -1)
  const esActual = mes === mesActual()
  const { hasta } = rangoMes(mes)
  const { perfil } = usePerfil()

  const obj = useObjetivosConContexto()
  const { saldos } = useSaldosCuentas(mes)
  const { movimientos } = useMovimientosDelMes(mes)
  const { movimientos: inversiones } = useInversiones()
  const tenencias = useMemo(() => calcularTenencias(inversiones.filter((m) => m.fecha < hasta)), [inversiones, hasta])
  const { activos, cuentas } = { activos: obj.ctx.activos, cuentas: obj.ctx.cuentas }
  const existente = obj.cierres.find((c) => c.mes.slice(0, 7) === mes)
  const anterior = obj.cierres.find((c) => c.mes.slice(0, 7) < mes)

  const divisaDe = new Map(activos.map((a) => [a.id, a.divisa]))
  const nombreActivo = new Map(activos.map((a) => [a.id, a.nombre]))
  const aValuar = tenencias.filter((t) => t.cantidad > 0 && !(t.activo_id && divisaDe.get(t.activo_id)))

  const monedas = useMemo(() => {
    const s = new Set<Moneda>(['USD'])
    for (const x of saldos) s.add(x.moneda)
    for (const m of movimientos) s.add(m.moneda)
    for (const t of tenencias) s.add(t.moneda)
    for (const a of activos) if (a.divisa) s.add(a.divisa)
    for (const o of obj.objetivos) s.add(o.moneda)
    for (const f of perfil?.monedas_favoritas ?? []) s.add(f)
    s.delete('ARS')
    return [...s].sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)))
  }, [saldos, movimientos, tenencias, activos, obj.objetivos, perfil?.monedas_favoritas])

  const [tiposTxt, setTiposTxt] = useState<Record<string, { v: string; f: Fuente }>>({})
  const [preciosTxt, setPreciosTxt] = useState<Record<string, { v: string; f: Fuente }>>({})
  const [trayendo, setTrayendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargadoPara, setCargadoPara] = useState<string | null>(null)

  async function traerAutomatico(base: CierreT | undefined) {
    setTrayendo(true)
    setAviso(null)
    const t = await traerTipos(monedas, mes, esActual)
    const ids = aValuar.map((x) => (x.activo_id ? idCripto(nombreActivo.get(x.activo_id) ?? '') : null)).filter(Boolean) as string[]
    const cripto = esActual ? await traerCripto(ids) : new Map<string, number>()
    setTiposTxt((prev) => {
      const n = { ...prev }
      for (const m of monedas) {
        if (t.get(m)) n[m] = { v: montoAEditable(Math.round(t.get(m)! * 100) / 100), f: 'auto' }
        else if (!n[m]?.v && base?.tipos.get(m)) n[m] = { v: montoAEditable(base.tipos.get(m)!), f: 'manual' }
      }
      return n
    })
    setPreciosTxt((prev) => {
      const n = { ...prev }
      for (const x of aValuar) {
        const clave = x.activo_id ?? `cat:${x.categoria_id}`
        const id = x.activo_id ? idCripto(nombreActivo.get(x.activo_id) ?? '') : null
        const usd = id ? cripto.get(id) : undefined
        const precio = usd !== undefined ? convertir(usd, 'USD', x.moneda, t) : null
        if (precio) n[clave] = { v: montoAEditable(Math.round(precio * 100) / 100), f: 'auto' }
        else if (!n[clave]?.v && base?.precios.get(clave)) n[clave] = { v: montoAEditable(base.precios.get(clave)!.precio), f: 'manual' }
      }
      return n
    })
    if (!t.get('USD')) setAviso('No pude traer el dólar MEP automáticamente. Cargalo a mano.')
    else if (!esActual) setAviso('Cotizaciones del último día hábil del mes. Las cripto no tienen histórico: cargalas a mano.')
    setTrayendo(false)
  }

  // Al elegir un mes: si ya estaba cerrado, se muestra lo guardado; si no, se trae lo automático.
  useEffect(() => {
    if (obj.loading || cargadoPara === mes) return
    setCargadoPara(mes)
    setOk(false)
    setError(null)
    if (existente) {
      setTiposTxt(Object.fromEntries([...existente.tipos].map(([m, v]) => [m, { v: montoAEditable(v), f: 'manual' as Fuente }])))
      setPreciosTxt(
        Object.fromEntries([...existente.precios].map(([k, p]) => [k, { v: montoAEditable(p.precio), f: 'manual' as Fuente }])),
      )
    } else {
      setTiposTxt({})
      setPreciosTxt({})
      traerAutomatico(anterior)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, obj.loading, existente?.id])

  // Tipos y precios tal como están cargados en pantalla.
  const tipos: Tipos = new Map()
  for (const [m, x] of Object.entries(tiposTxt)) {
    const v = parseNumero(x.v, 6)
    if (v && v > 0) tipos.set(m, v)
  }
  const precios = new Map<string, { precio: number; moneda: Moneda }>()
  for (const x of aValuar) {
    const clave = x.activo_id ?? `cat:${x.categoria_id}`
    const v = parsePrecio(preciosTxt[clave]?.v ?? '')
    if (v !== null && v >= 0) precios.set(clave, { precio: v, moneda: x.moneda })
  }

  // Resumen del mes en dólares.
  const usd = (m: number, de: Moneda) => convertir(m, de, 'USD', tipos)
  const totales = totalesPorMoneda(movimientos, activos, cuentas)
  let ingresos = 0
  let gastos = 0
  let sinConvertir = false
  for (const [m, t] of totales) {
    const i = usd(t.ingresos, m)
    const g = usd(t.gastos, m)
    if (i === null || g === null) sinConvertir = true
    ingresos += i ?? 0
    gastos += g ?? 0
  }
  let enCuentas = 0
  for (const s of saldos) {
    const tipo = cuentas.find((c) => c.id === s.cuenta_id)?.tipo
    if (tipo === 'grupo') continue
    const v = usd(s.monto, s.moneda)
    if (v === null) sinConvertir = true
    enCuentas += v ?? 0
  }
  let enInversiones = 0
  let sinPrecio = 0
  for (const t of tenencias.filter((x) => x.cantidad > 0)) {
    const divisa = t.activo_id ? divisaDe.get(t.activo_id) : null
    const clave = t.activo_id ?? `cat:${t.categoria_id}`
    const p = precios.get(clave)
    const valor = divisa ? usd(t.cantidad, divisa) : p ? usd(t.cantidad * p.precio, p.moneda) : usd(t.costo, t.moneda)
    if (!divisa && !p) sinPrecio++
    if (valor === null) sinConvertir = true
    enInversiones += valor ?? 0
  }
  const patrimonio = enCuentas + enInversiones

  async function guardar() {
    setError(null)
    if (!tipos.get('USD')) return setError('Falta el dólar MEP.')
    setBusy(true)
    const r = await supabase
      .from('cierres')
      .upsert({ mes: `${mes}-01`, cerrado_at: new Date().toISOString() }, { onConflict: 'usuario_id,mes' })
      .select('id')
      .single()
    if (r.error) {
      setBusy(false)
      return setError(
        /relation|does not exist|schema cache/i.test(r.error.message) ? 'Falta ejecutar el SQL de objetivos y cierre en Supabase.' : r.error.message,
      )
    }
    const id = r.data.id as string
    await Promise.all([
      supabase.from('cierre_tipos').delete().eq('cierre_id', id),
      supabase.from('cierre_precios').delete().eq('cierre_id', id),
      supabase.from('cierre_objetivos').delete().eq('cierre_id', id),
    ])
    const filasTipos = [...tipos].map(([moneda, ars]) => ({ cierre_id: id, moneda, ars, fuente: tiposTxt[moneda]?.f ?? 'manual' }))
    const filasPrecios = [...precios].map(([clave, p]) => ({
      cierre_id: id,
      clave,
      precio: p.precio,
      moneda: p.moneda,
      fuente: preciosTxt[clave]?.f ?? 'manual',
    }))
    // Foto del progreso de cada objetivo con las cotizaciones de este cierre.
    const ctxCierre = {
      ...obj.ctx,
      saldos,
      tenencias,
      tipos,
      ultimoCierre: { id, mes: `${mes}-01`, cerrado_at: '', tipos, precios, objetivos: new Map() },
    }
    const filasObjetivos = obj.objetivos
      .filter((o) => o.estado !== 'cumplido')
      .map((o) => {
        const aportesHasta = obj.aportes.filter((a) => a.fecha < hasta)
        const p = calcularProgreso(o, obj.vinculos, aportesHasta, ctxCierre)
        return { cierre_id: id, objetivo_id: o.id, progreso: Math.round(p.total * 100) / 100, moneda: o.moneda }
      })
    const res = await Promise.all([
      filasTipos.length ? supabase.from('cierre_tipos').insert(filasTipos) : null,
      filasPrecios.length ? supabase.from('cierre_precios').insert(filasPrecios) : null,
      filasObjetivos.length ? supabase.from('cierre_objetivos').insert(filasObjetivos) : null,
    ])
    setBusy(false)
    const fallo = res.find((x) => x?.error)
    if (fallo?.error) return setError(fallo.error.message)
    setOk(true)
    obj.recargarCierres()
  }

  const nombreDelMes = nombreMes(mes).split(' ')[0].toLowerCase()
  const fmtUsd = (n: number) => formatMonto(Math.round(n), 'USD')

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Cierre de mes</h1>
        </div>
      </header>

      <div className="selector-mes">
        <button onClick={() => setParams({ mes: moverMes(mes, -1) }, { replace: true })} aria-label="Mes anterior">
          <ChevronLeft size={22} />
        </button>
        <span className="mes-actual">
          <CalendarDays size={20} aria-hidden="true" />
          {nombreMes(mes)}
        </span>
        <button onClick={() => setParams({ mes: moverMes(mes, 1) }, { replace: true })} aria-label="Mes siguiente" disabled={esActual}>
          <ChevronRight size={22} />
        </button>
      </div>

      {existente && !ok && (
        <p className="info chico">
          Ya cerraste {nombreDelMes} el {new Date(existente.cerrado_at).toLocaleDateString('es-AR')}. Podés corregirlo y
          volver a guardar.
        </p>
      )}

      <section className="card">
        <div className="titulo-con-accion">
          <h2>Tipos de cambio</h2>
          <button className="boton-icono" onClick={() => traerAutomatico(anterior)} disabled={trayendo} aria-label="Volver a traer las cotizaciones">
            <RefreshCw size={18} className={trayendo ? 'girando' : ''} />
          </button>
        </div>
        <p className="muted chico">Pesos por cada unidad. El dólar es el MEP{esActual ? ' de hoy' : ` del cierre de ${nombreDelMes}`}.</p>
        <ul className="lista">
          {monedas.map((m) => (
            <li key={m} className="fila precio-fila">
              <span>
                1 <strong>{m}</strong> =
              </span>
              <span className="precio-input">
                <span className="muted">$</span>
                <InputNumero
                  decimales={6}
                  value={tiposTxt[m]?.v ?? ''}
                  onChange={(v) => setTiposTxt({ ...tiposTxt, [m]: { v, f: 'manual' } })}
                  placeholder={trayendo ? '…' : '0'}
                  aria-label={`Pesos por ${m}`}
                />
              </span>
              {tiposTxt[m]?.f === 'auto' && <span className="etiqueta-auto">auto</span>}
            </li>
          ))}
        </ul>
        {aviso && <p className="muted chico">{aviso}</p>}
      </section>

      {aValuar.length > 0 && (
        <section className="card">
          <h2>Precio de tus inversiones</h2>
          <p className="muted chico">
            Precio por unidad al cierre (lo ves en tu broker). Te sugerimos el del cierre anterior; las cripto se traen
            solas.
          </p>
          <ul className="lista">
            {aValuar.map((t) => {
              const clave = t.activo_id ?? `cat:${t.categoria_id}`
              const p = precios.get(clave)
              const valor = p ? t.cantidad * p.precio : null
              const resultado = valor !== null ? valor - t.costo : null
              return (
                <li key={t.clave} className="inversion-cierre">
                  <div className="fila">
                    <div>
                      <div>{t.activo_id ? nombreActivo.get(t.activo_id) : 'Sin subcategoría'}</div>
                      <div className="muted chico">
                        {formatCantidad(t.cantidad)} · compraste a {formatPrecio(t.ppp, t.moneda)}
                      </div>
                    </div>
                    <span className="precio-input">
                      <span className="muted">{t.moneda === 'ARS' ? '$' : t.moneda}</span>
                      <InputNumero
                        decimales={8}
                        value={preciosTxt[clave]?.v ?? ''}
                        onChange={(v) => setPreciosTxt({ ...preciosTxt, [clave]: { v, f: 'manual' } })}
                        placeholder="Precio"
                        aria-label={`Precio de ${t.activo_id ? nombreActivo.get(t.activo_id) : 'la inversión'}`}
                      />
                    </span>
                  </div>
                  {valor !== null && (
                    <p className="chico muted">
                      Vale {formatMonto(Math.round(valor), t.moneda)}
                      {resultado !== null && (
                        <span className={resultado < 0 ? 'negativo' : 'positivo'}>
                          {' '}
                          ({resultado >= 0 ? '+' : '−'}
                          {formatMonto(Math.abs(Math.round(resultado)), t.moneda)})
                        </span>
                      )}
                      {preciosTxt[clave]?.f === 'auto' && <span className="etiqueta-auto">auto</span>}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>{nombreMes(mes).split(' ')[0]} en dólares</h2>
        <dl className="totales">
          <div>
            <dt>Ingresos</dt>
            <dd>{fmtUsd(ingresos)}</dd>
          </div>
          <div>
            <dt>Gastos</dt>
            <dd>{fmtUsd(gastos)}</dd>
          </div>
          <div className="destacado">
            <dt>Ahorraste</dt>
            <dd className={ingresos - gastos < 0 ? 'negativo' : 'positivo'}>{fmtUsd(ingresos - gastos)}</dd>
          </div>
        </dl>
        <dl className="totales">
          <div>
            <dt>En tus cuentas</dt>
            <dd>{fmtUsd(enCuentas)}</dd>
          </div>
          <div>
            <dt>En inversiones</dt>
            <dd>{fmtUsd(enInversiones)}</dd>
          </div>
          <div className="destacado">
            <dt>Patrimonio</dt>
            <dd>{fmtUsd(patrimonio)}</dd>
          </div>
        </dl>
        {(sinConvertir || sinPrecio > 0) && (
          <p className="muted chico">
            {sinConvertir && 'Hay montos en monedas sin tipo de cambio cargado: no suman. '}
            {sinPrecio > 0 && `${sinPrecio === 1 ? '1 inversión' : `${sinPrecio} inversiones`} sin precio cuenta${sinPrecio === 1 ? '' : 'n'} por lo que pagaste.`}
          </p>
        )}
        <p className="muted chico">El patrimonio descuenta lo que debés de tarjetas.</p>
      </section>

      {error && <p className="error">{error}</p>}
      {ok && <p className="info">Listo, {nombreDelMes} quedó cerrado. Tus objetivos e inversiones usan estos valores.</p>}
      <button className="primary boton-ancho" onClick={guardar} disabled={busy || trayendo}>
        {busy ? 'Guardando…' : existente ? `Guardar cambios de ${nombreDelMes}` : `Cerrar ${nombreDelMes}`}
      </button>
      <BottomNav />
    </main>
  )
}
