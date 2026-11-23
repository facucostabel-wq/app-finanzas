import { useCallback, useEffect, useState } from 'react'
import { armarCartera, totalesCartera, type Valuacion } from './cartera'
import { convertir, traerTipos, type Cierre, type Tipos } from './cotizaciones'
import {
  CAMPOS_MOV,
  nombreCuenta,
  normalizar,
  TEXTO_TIPO_CUENTA,
  type Activo,
  type Categoria,
  type Cuenta,
  type SaldoInicial,
} from './datos'
import { mesActual, moverMes, nombreMes, rangoMes, type Mes, type Moneda } from './format'
import { calcularProgreso, type Aporte, type Objetivo, type Vinculo } from './objetivos'
import { supabase } from './supabase'
import { calcularTenencias } from './tenencias'

// ============================================================
// Activación (el usuario acepta que sus datos salgan hacia una IA externa)
// ============================================================

/** Si el análisis con IA está activado (perfiles.ia_activada_at). */
export function useIaActiva() {
  const [activa, setActiva] = useState<boolean | null>(null)
  const [faltaSql, setFaltaSql] = useState(false)
  const recargar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return
    const { data, error } = await supabase.from('perfiles').select('ia_activada_at').eq('id', uid).maybeSingle()
    setFaltaSql(Boolean(error))
    setActiva(Boolean(data?.ia_activada_at))
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])

  const cambiar = async (activar: boolean) => {
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user.id
    if (!uid) return 'Tenés que estar logueado'
    const { error } = await supabase
      .from('perfiles')
      .update({ ia_activada_at: activar ? new Date().toISOString() : null })
      .eq('id', uid)
    if (error) return error.message
    setActiva(activar)
    return null
  }
  return { activa, faltaSql, cambiar }
}

// ============================================================
// Formato de números (argentino: punto de miles, coma decimal)
// ============================================================

const num = (x: number, dec = 2) =>
  x.toLocaleString('es-AR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })
const decDe = (moneda: Moneda) => (moneda === 'ARS' ? 0 : 2)
const plata = (x: number, moneda: Moneda) => `${num(x, decDe(moneda))} ${moneda}`
const usd = (x: number) => `${num(x, 2)} USD`
const pct = (x: number | null) => (x === null || !Number.isFinite(x) ? '—' : `${num(x, 1)}%`)
const cant = (x: number) => x.toLocaleString('es-AR', { maximumFractionDigits: 8 })
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
/** Escapa "|" para que no rompa las tablas. */
const t = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

function tabla(encabezado: string[], filas: string[][]): string {
  if (!filas.length) return '_(sin datos)_\n'
  const linea = (c: string[]) => `| ${c.join(' | ')} |`
  return [linea(encabezado), linea(encabezado.map(() => '---')), ...filas.map(linea)].join('\n') + '\n'
}

// ============================================================
// Datos
// ============================================================

async function leerTodo<T>(consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999)
    if (error) throw error
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) return filas
  }
}

export type Contexto = {
  mepEn: ((fecha: string) => number | null) | null
  tiposHoy: Tipos
}

/** Cierres del usuario con sus cotizaciones, precios y objetivos. */
async function traerCierres(): Promise<Cierre[]> {
  const { data: cs } = await supabase.from('cierres').select('id, mes, cerrado_at').order('mes', { ascending: false })
  if (!cs?.length) return []
  const ids = cs.map((c) => c.id)
  const [tp, pr, ob] = await Promise.all([
    supabase.from('cierre_tipos').select('cierre_id, moneda, ars').in('cierre_id', ids),
    supabase.from('cierre_precios').select('cierre_id, clave, precio, moneda').in('cierre_id', ids),
    supabase.from('cierre_objetivos').select('cierre_id, objetivo_id, progreso').in('cierre_id', ids),
  ])
  return cs.map((c) => ({
    id: c.id,
    mes: c.mes,
    cerrado_at: c.cerrado_at,
    tipos: new Map((tp.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.moneda, Number(x.ars)])),
    precios: new Map(
      (pr.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.clave, { precio: Number(x.precio), moneda: x.moneda }]),
    ),
    objetivos: new Map((ob.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.objetivo_id, Number(x.progreso)])),
  }))
}

type Metricas = {
  mes: Mes
  ingresosUsd: number
  gastosUsd: number
  invertidoUsd: number
  gastosArs: number
  /** Gastos por categoría en USD. */
  porCategoria: Map<string, number>
  aproximado: boolean
}

// ============================================================
// Reporte mensual
// ============================================================

/**
 * Arma el reporte de un mes en texto (Markdown), listo para mandar a cualquier IA.
 * Sin notas de movimientos ni nombres de personas: solo montos, categorías, cuentas,
 * inversiones, objetivos y el nombre de los grupos.
 */
export async function armarReporte(mes: Mes, ctx: Contexto): Promise<string> {
  const esActual = mes === mesActual()
  const { desde, hasta } = rangoMes(mes)
  const desdeHistorico = `${moverMes(mes, -11)}-01`

  const [cats, ctas, acts, movs, sal, futuras, val, objs, vins, aps, cierres] = await Promise.all([
    supabase.from('categorias').select('*'),
    supabase.from('cuentas').select('*').order('orden'),
    supabase.from('activos').select('*'),
    leerTodo((a, b) => supabase.from('movimientos').select(CAMPOS_MOV).lt('fecha', hasta).order('fecha').order('creado_at').range(a, b)),
    supabase.rpc('saldos_al', { hasta }),
    supabase.from('movimientos').select('fecha, monto, moneda, cuenta_id').not('compra_id', 'is', null).gte('fecha', hasta),
    supabase.from('valuaciones').select('clave, precio, total, moneda, actualizado_at'),
    supabase.from('objetivos').select('id, nombre, icono, monto, moneda, fecha, estado, cumplido_at, creado_at').order('creado_at'),
    supabase.from('objetivo_vinculos').select('id, objetivo_id, cuenta_id, activo_id, moneda'),
    supabase.from('objetivo_aportes').select('id, objetivo_id, fecha, monto, moneda, cuenta_id, nota').lt('fecha', hasta),
    traerCierres(),
  ])

  // Sin categorías o cuentas el reporte saldría lleno de "—": mejor avisar el error.
  for (const [nombre, r] of [
    ['categorías', cats],
    ['cuentas', ctas],
    ['subcategorías de inversión', acts],
  ] as const)
    if (r.error) throw new Error(`no se pudieron leer las ${nombre} (${r.error.message})`)
  const categorias = (cats.data ?? []) as Categoria[]
  const cuentas = (ctas.data ?? []) as Cuenta[]
  const activos = (acts.data ?? []) as Activo[]
  const todos = (movs as Record<string, unknown>[]).map(normalizar)
  const saldos: SaldoInicial[] = ((sal.data ?? []) as { cuenta_id: string; moneda: string; monto: number }[]).map((r) => ({
    cuenta_id: r.cuenta_id,
    moneda: r.moneda,
    monto: Number(r.monto),
  }))
  const valuaciones = ((val.data ?? []) as Valuacion[])
    .map((v) => ({
      ...v,
      precio: v.precio === null ? null : Number(v.precio),
      total: v.total === null ? null : Number(v.total),
    }))
    .filter((v) => v.actualizado_at < `${hasta}T03:00:00Z`)
  const objetivos = ((objs.data ?? []) as Objetivo[]).map((o) => ({
    ...o,
    monto: Number(o.monto),
  }))
  const vinculos = ((vins.data ?? []) as Partial<Vinculo>[]).map((x) => ({ moneda: null, ...x }) as Vinculo)
  const aportes = ((aps.data ?? []) as Aporte[]).map((a) => ({
    ...a,
    monto: Number(a.monto),
  }))

  const catPorId = new Map(categorias.map((c) => [c.id, c]))
  const nombreCat = (id: string | null) => t(catPorId.get(id ?? '')?.nombre ?? 'Sin categoría')
  const actPorId = new Map(activos.map((a) => [a.id, a]))
  const ctaPorId = new Map(cuentas.map((c) => [c.id, c]))
  const nomCuenta = (id: string | null) => {
    const c = id ? ctaPorId.get(id) : undefined
    if (!c) return '—'
    return c.tipo === 'grupo' ? `Grupo "${nombreCuenta(c).replace(/^Grupo /, '')}"` : c.nombre
  }

  // Cotizaciones del mes: las del cierre; si no hay, hoy (mes en curso) o las del último día hábil.
  const cierreMes = cierres.find((c) => c.mes.slice(0, 7) === mes)
  const cierreRef = cierres.find((c) => c.mes.slice(0, 7) <= mes)
  const monedas = [
    ...new Set([...todos.map((m) => m.moneda), ...saldos.map((s) => s.moneda), ...activos.filter((a) => a.divisa).map((a) => a.divisa!)]),
  ]
  let tipos: Tipos
  let origenTipos: string
  if (cierreMes?.tipos.get('USD')) {
    tipos = cierreMes.tipos
    origenTipos = 'cargada en el cierre del mes'
  } else if (esActual) {
    tipos = ctx.tiposHoy
    origenTipos = 'de hoy'
  } else {
    tipos = await traerTipos(monedas, mes, false)
    origenTipos = 'del último día hábil del mes'
    if (!tipos.get('USD')) {
      tipos = ctx.tiposHoy
      origenTipos = 'de hoy (no se pudo obtener la del mes)'
    }
  }
  const mepMes = tipos.get('USD') ?? null

  /** Monto en USD al MEP de su fecha (si no está la serie, al del mes). */
  const aUsd = (monto: number, moneda: Moneda, fecha: string): { v: number; aprox: boolean } => {
    if (moneda === 'USD') return { v: monto, aprox: false }
    if (moneda === 'ARS') {
      const mep = ctx.mepEn?.(fecha) ?? null
      if (mep) return { v: monto / mep, aprox: false }
      return { v: mepMes ? monto / mepMes : 0, aprox: true }
    }
    const v = convertir(monto, moneda, 'USD', tipos)
    return { v: v ?? 0, aprox: true }
  }

  // ---- Métricas de los últimos 12 meses ----
  const metricas = new Map<Mes, Metricas>()
  for (let i = 11; i >= 0; i--) {
    const m = moverMes(mes, -i)
    metricas.set(m, {
      mes: m,
      ingresosUsd: 0,
      gastosUsd: 0,
      invertidoUsd: 0,
      gastosArs: 0,
      porCategoria: new Map(),
      aproximado: false,
    })
  }
  for (const m of todos) {
    if (m.fecha < desdeHistorico) continue
    const x = metricas.get(m.fecha.slice(0, 7))
    if (!x || m.tipo === 'transferencia') continue
    const u = aUsd(m.monto, m.moneda, m.fecha)
    if (u.aprox) x.aproximado = true
    if (m.tipo === 'ingreso') x.ingresosUsd += u.v
    else if (m.tipo === 'gasto') {
      x.gastosUsd += u.v
      if (m.moneda === 'ARS') x.gastosArs += m.monto
      if (m.categoria_id) x.porCategoria.set(m.categoria_id, (x.porCategoria.get(m.categoria_id) ?? 0) + u.v)
    } else if (m.tipo === 'aporte') x.invertidoUsd += u.v
    else if (m.tipo === 'rescate') x.invertidoUsd -= u.v
  }
  const conDatos = [...metricas.values()].filter((x) => x.ingresosUsd || x.gastosUsd || x.invertidoUsd)
  const actual = metricas.get(mes)!
  const previos = [1, 2, 3]
    .map((i) => metricas.get(moverMes(mes, -i)))
    .filter((x): x is Metricas => Boolean(x && (x.gastosUsd || x.ingresosUsd)))

  // ---- Movimientos del mes ----
  const delMes = todos.filter((m) => m.fecha >= desde && m.fecha < hasta).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const porMoneda = new Map<
    Moneda,
    {
      ing: number
      gas: number
      tarjeta: number
      aportes: number
      rescates: number
    }
  >()
  for (const m of delMes) {
    const x = porMoneda.get(m.moneda) ?? {
      ing: 0,
      gas: 0,
      tarjeta: 0,
      aportes: 0,
      rescates: 0,
    }
    if (m.tipo === 'ingreso') x.ing += m.monto
    if (m.tipo === 'gasto') {
      x.gas += m.monto
      if (ctaPorId.get(m.cuenta_id)?.tipo === 'tarjeta') x.tarjeta += m.monto
    }
    if (m.tipo === 'aporte') x.aportes += m.monto
    if (m.tipo === 'rescate') x.rescates += m.monto
    porMoneda.set(m.moneda, x)
  }

  const out: string[] = []
  const hoy = new Date()
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  out.push(`# Reporte mensual: ${nombreMes(mes)} · app Finanzas`)
  out.push('')
  out.push(
    '> **Para la IA:** este es mi reporte del mes. Seguí las instrucciones del prompt inicial. Usá solo los números de este reporte y de la bitácora que te mande; al terminar, devolveme la bitácora completa y actualizada.',
  )
  out.push('')
  out.push(`- Generado el ${fechaCorta(hoyIso)}.${esActual ? ' **Mes en curso: datos hasta hoy, el mes todavía no terminó.**' : ''}`)
  out.push(
    `- Período: ${fechaCorta(desde)} al ${fechaCorta(new Date(Date.parse(`${hasta}T12:00:00Z`) - 86400000).toISOString().slice(0, 10))}.`,
  )
  out.push(
    `- Dólar MEP del mes: ${mepMes ? `${num(mepMes, 2)} ARS (${origenTipos})` : 'sin dato'}. Para los totales en USD, cada movimiento en pesos se convierte con el MEP de su fecha.`,
  )
  out.push(`- Cierre de mes: ${cierreMes ? `hecho el ${fechaCorta(cierreMes.cerrado_at.slice(0, 10))}` : 'todavía no se hizo'}.`)
  out.push('- Números en formato argentino: punto para miles y coma para decimales (1.250,50 = mil doscientos cincuenta con cincuenta).')
  out.push('- No incluye notas de los movimientos ni nombres de personas.')
  out.push('')

  // 1. Resumen
  out.push('## 1. Resumen del mes')
  out.push('')
  const ahorroUsd = actual.ingresosUsd - actual.gastosUsd
  out.push(
    tabla(
      ['Concepto', 'En USD'],
      [
        ['Ingresos', usd(actual.ingresosUsd)],
        ['Gastos', usd(actual.gastosUsd)],
        ['Ahorro (ingresos − gastos)', usd(ahorroUsd)],
        ['% de ahorro', pct(actual.ingresosUsd > 0 ? (ahorroUsd / actual.ingresosUsd) * 100 : null)],
        ['Invertido neto (compras − ventas)', usd(actual.invertidoUsd)],
      ],
    ),
  )
  out.push('Por moneda, sin convertir:')
  out.push('')
  out.push(
    tabla(
      ['Moneda', 'Ingresos', 'Gastos', 'De esos gastos, con tarjeta', 'Compras de inversiones', 'Ventas de inversiones'],
      [...porMoneda].map(([mo, x]) => [
        mo,
        plata(x.ing, mo),
        plata(x.gas, mo),
        plata(x.tarjeta, mo),
        plata(x.aportes, mo),
        plata(x.rescates, mo),
      ]),
    ),
  )
  if (previos.length) {
    const prom = (f: (x: Metricas) => number) => previos.reduce((s, x) => s + f(x), 0) / previos.length
    out.push(
      `Promedio ${previos.length === 1 ? 'del mes anterior' : `de los ${previos.length} meses anteriores`}: ingresos ${usd(prom((x) => x.ingresosUsd))}, gastos ${usd(prom((x) => x.gastosUsd))}.`,
    )
    out.push('')
  }

  // 2. Gastos por categoría
  out.push('## 2. Gastos por categoría')
  out.push('')
  const catsGasto = [...actual.porCategoria].sort((a, b) => b[1] - a[1])
  // Gastos hechos desde la cuenta de un grupo = mi parte de gastos compartidos.
  const esDeGrupo = (m: { cuenta_id: string }) => ctaPorId.get(m.cuenta_id)?.tipo === 'grupo'
  const enGrupos = new Map<string, number>()
  for (const m of delMes)
    if (m.tipo === 'gasto' && m.categoria_id && esDeGrupo(m))
      enGrupos.set(m.categoria_id, (enGrupos.get(m.categoria_id) ?? 0) + aUsd(m.monto, m.moneda, m.fecha).v)
  const arsPorCat = new Map<string, number>()
  for (const m of delMes)
    if (m.tipo === 'gasto' && m.moneda === 'ARS' && m.categoria_id)
      arsPorCat.set(m.categoria_id, (arsPorCat.get(m.categoria_id) ?? 0) + m.monto)
  out.push(
    tabla(
      [
        'Categoría',
        'USD',
        'En pesos',
        'De eso, en grupos (USD)',
        '% del gasto',
        previos.length === 1 ? 'Mes anterior (USD)' : `Promedio ${previos.length || 3} meses anteriores (USD)`,
        'Variación',
      ],
      catsGasto.map(([id, v]) => {
        const prom = previos.length ? previos.reduce((s, x) => s + (x.porCategoria.get(id) ?? 0), 0) / previos.length : null
        return [
          t(catPorId.get(id)?.nombre ?? 'Sin categoría'),
          usd(v),
          arsPorCat.get(id) ? plata(arsPorCat.get(id)!, 'ARS') : '—',
          enGrupos.get(id) ? usd(enGrupos.get(id)!) : '—',
          pct(actual.gastosUsd ? (v / actual.gastosUsd) * 100 : null),
          prom !== null ? usd(prom) : '—',
          prom ? pct(((v - prom) / prom) * 100) : '—',
        ]
      }),
    ),
  )

  // Gastos compartidos, por grupo y categoría (sin miembros)
  const gastosGrupo = delMes.filter((m) => m.tipo === 'gasto' && esDeGrupo(m))
  if (gastosGrupo.length) {
    out.push('**Gastos compartidos en grupos (solo mi parte):**')
    out.push('')
    const acc = new Map<string, { grupo: string; cat: string; moneda: Moneda; monto: number; usd: number; n: number }>()
    for (const m of gastosGrupo) {
      const grupo = nombreCuenta(ctaPorId.get(m.cuenta_id)!).replace(/^Grupo /, '')
      const cat = catPorId.get(m.categoria_id ?? '')?.nombre ?? 'Sin categoría'
      const k = `${grupo}|${cat}|${m.moneda}`
      const x = acc.get(k) ?? { grupo, cat, moneda: m.moneda, monto: 0, usd: 0, n: 0 }
      x.monto += m.monto
      x.usd += aUsd(m.monto, m.moneda, m.fecha).v
      x.n += 1
      acc.set(k, x)
    }
    out.push(
      tabla(
        ['Grupo', 'Categoría', 'Mi parte', 'En USD', 'Cantidad de gastos'],
        [...acc.values()]
          .sort((a, b) => a.grupo.localeCompare(b.grupo) || b.usd - a.usd)
          .map((x) => [t(x.grupo), t(x.cat), plata(x.monto, x.moneda), usd(x.usd), String(x.n)]),
      ),
    )
  }

  // 3. Ingresos por categoría
  out.push('## 3. Ingresos por categoría')
  out.push('')
  const ingCat = new Map<string, number>()
  for (const m of delMes)
    if (m.tipo === 'ingreso') ingCat.set(m.categoria_id ?? '', (ingCat.get(m.categoria_id ?? '') ?? 0) + aUsd(m.monto, m.moneda, m.fecha).v)
  out.push(
    tabla(
      ['Categoría', 'USD'],
      [...ingCat].sort((a, b) => b[1] - a[1]).map(([id, v]) => [t(catPorId.get(id)?.nombre ?? 'Sin categoría'), usd(v)]),
    ),
  )

  // 4. Histórico
  out.push('## 4. Histórico de los últimos 12 meses (calculado por la app)')
  out.push('')
  out.push(
    'Estos números salen de todos los movimientos cargados: usalos para comparar en lugar de recordarlos de conversaciones anteriores.',
  )
  out.push('')
  out.push(
    tabla(
      ['Mes', 'Ingresos USD', 'Gastos USD', 'Ahorro USD', '% ahorro', 'Invertido neto USD', 'Gastos en pesos', 'MEP fin de mes'],
      conDatos.map((x) => {
        const [y, mm] = x.mes.split('-').map(Number)
        const fin = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10)
        const mep = ctx.mepEn?.(fin < hoyIso ? fin : hoyIso) ?? null
        const ah = x.ingresosUsd - x.gastosUsd
        return [
          `${nombreMes(x.mes)}${x.mes === mes && esActual ? ' (en curso)' : ''}`,
          num(x.ingresosUsd),
          num(x.gastosUsd),
          num(ah),
          pct(x.ingresosUsd > 0 ? (ah / x.ingresosUsd) * 100 : null),
          num(x.invertidoUsd),
          num(x.gastosArs, 0),
          mep ? num(mep) : '—',
        ]
      }),
    ),
  )
  if (conDatos.some((x) => x.aproximado))
    out.push('_Algunas conversiones usaron el dólar del mes en lugar del de cada día (faltaba la cotización diaria)._\n')

  // 5. Cuentas
  out.push(`## 5. Saldos de las cuentas al ${esActual ? 'día de hoy' : 'cierre del mes'}`)
  out.push('')
  const filasCuentas = saldos
    .filter((s) => Math.abs(s.monto) >= 0.005)
    .map((s) => ({ s, c: ctaPorId.get(s.cuenta_id) }))
    .filter((x) => x.c)
    .sort((a, b) => a.c!.orden - b.c!.orden)
  out.push(
    tabla(
      ['Cuenta', 'Tipo', 'Saldo', 'En USD'],
      filasCuentas.map(({ s, c }) => [
        t(nomCuenta(c!.id)),
        TEXTO_TIPO_CUENTA[c!.tipo] ?? c!.tipo,
        plata(s.monto, s.moneda),
        (() => {
          const v = convertir(s.monto, s.moneda, 'USD', tipos)
          return v === null ? '—' : usd(v)
        })(),
      ]),
    ),
  )
  const grupoTotal = (pred: (c: Cuenta) => boolean) => {
    const acc = new Map<Moneda, number>()
    for (const { s, c } of filasCuentas) if (pred(c!)) acc.set(s.moneda, (acc.get(s.moneda) ?? 0) + s.monto)
    return [...acc].map(([m, v]) => plata(v, m)).join(' + ') || '0'
  }
  out.push(`- Disponible (banco, billeteras y efectivo): ${grupoTotal((c) => ['banco', 'billetera', 'efectivo'].includes(c.tipo))}.`)
  out.push(`- Tarjetas (negativo = deuda del resumen): ${grupoTotal((c) => c.tipo === 'tarjeta')}.`)
  out.push(`- Grupos (positivo = me deben; negativo = debo): ${grupoTotal((c) => c.tipo === 'grupo')}.`)
  out.push(`- Broker (plata sin invertir): ${grupoTotal((c) => c.tipo === 'broker')}.`)
  out.push('')

  // Cuotas por vencer
  const cuotas = new Map<string, number>()
  for (const r of (futuras.data ?? []) as {
    fecha: string
    monto: number
    moneda: string
  }[]) {
    const k = `${r.fecha.slice(0, 7)}|${r.moneda}`
    cuotas.set(k, (cuotas.get(k) ?? 0) + Number(r.monto))
  }
  if (cuotas.size) {
    out.push('**Cuotas que quedan por pagar (ya comprometidas):**')
    out.push('')
    out.push(
      tabla(
        ['Mes', 'Monto'],
        [...cuotas]
          .sort()
          .slice(0, 12)
          .map(([k, v]) => {
            const [m, mo] = k.split('|')
            return [nombreMes(m), plata(v, mo)]
          }),
      ),
    )
  }

  // 6. Inversiones
  out.push('## 6. Inversiones')
  out.push('')
  const invMovs = todos.filter((m) => m.tipo === 'aporte' || m.tipo === 'rescate')
  const posiciones = armarCartera(invMovs, {
    activos,
    categorias,
    tipos,
    mepEn: ctx.mepEn,
    valuaciones,
    ultimoCierre: cierreRef,
  })
  const tot = totalesCartera(posiciones)
  const abiertas = posiciones
    .filter((p) => p.cantidad > 0 || (p.porMonto && p.costoUsd > 0.005) || p.valorUsd > 0.005)
    .sort((a, b) => b.valorUsd - a.valorUsd)
  const fuenteTxt = (p: (typeof posiciones)[number]) =>
    p.fuente === 'auto'
      ? 'cotización de la moneda'
      : p.fuente === 'cierre'
        ? `precio del cierre${p.valorFecha ? ` (${fechaCorta(p.valorFecha.slice(0, 10))})` : ''}`
        : p.fuente === 'manual'
          ? `cargado a mano${p.valorFecha ? ` el ${fechaCorta(p.valorFecha.slice(0, 10))}` : ''}`
          : 'al costo (sin precio)'
  out.push(
    tabla(
      ['Inversión', 'Categoría', 'Cantidad', 'Costo USD', 'Valor USD', 'Resultado USD', 'Resultado %', 'Valor según'],
      abiertas.map((p) => [
        t(p.nombre),
        t(catPorId.get(p.categoria_id)?.nombre ?? 'Sin categoría'),
        p.porMonto ? '—' : cant(p.cantidad),
        num(p.costoUsd),
        num(p.valorUsd),
        p.fuente === 'costo' ? '—' : num(p.resultadoUsd),
        p.fuente === 'costo' ? '—' : pct(p.porcentaje),
        fuenteTxt(p),
      ]),
    ),
  )
  out.push(`- Valor total de la cartera: ${usd(tot.valorUsd)} (costo ${usd(tot.costoUsd)}).`)
  out.push(
    `- Resultado sobre lo que tiene precio: ${usd(tot.resultadoUsd)} (${pct(tot.porcentaje)}).${tot.sinValor ? ` ${tot.sinValor} inversión(es) sin precio, contadas al costo.` : ''}`,
  )
  out.push(`- Resultado ya realizado por ventas (histórico): ${usd(tot.realizadoUsd)}.`)
  if (tot.valorUsd > 0)
    out.push(
      `- Reparto: ${tot.porCategoria.map((c) => `${catPorId.get(c.categoria_id)?.nombre ?? '—'} ${pct((c.valorUsd / tot.valorUsd) * 100)}`).join(', ')}.`,
    )
  out.push('')
  const invDelMes = delMes.filter((m) => m.tipo === 'aporte' || m.tipo === 'rescate')
  if (invDelMes.length) {
    out.push('**Compras y ventas del mes:**')
    out.push('')
    out.push(
      tabla(
        ['Fecha', 'Operación', 'Inversión', 'Cantidad', 'Monto'],
        invDelMes.map((m) => [
          fechaCorta(m.fecha),
          m.tipo === 'aporte' ? 'Compra' : 'Venta',
          t(m.activo_id ? (actPorId.get(m.activo_id)?.nombre ?? '—') : (catPorId.get(m.categoria_id ?? '')?.nombre ?? 'Sin categoría')),
          m.cantidad ? cant(m.cantidad) : '—',
          plata(m.monto, m.moneda),
        ]),
      ),
    )
  }

  // 7. Objetivos
  out.push('## 7. Objetivos')
  out.push('')
  const tenencias = calcularTenencias(invMovs)
  const ctxObj = {
    cuentas,
    saldos,
    activos,
    tenencias,
    tipos,
    ultimoCierre: cierreRef,
  }
  out.push(
    tabla(
      ['Objetivo', 'Meta', 'Avance', '%', 'Fecha límite', 'Falta por mes para llegar', 'Estado'],
      objetivos.map((o) => {
        const p = calcularProgreso(o, vinculos, aportes, ctxObj)
        const total = cierreMes?.objetivos.get(o.id) ?? p.total
        let porMes = '—'
        if (o.fecha && o.estado === 'activo' && total < o.monto) {
          const [fy, fm] = o.fecha.split('-').map(Number)
          const [my, mm] = mes.split('-').map(Number)
          const meses = Math.max(1, (fy - my) * 12 + (fm - mm))
          porMes = plata((o.monto - total) / meses, o.moneda)
        }
        return [
          t(o.nombre),
          plata(o.monto, o.moneda),
          plata(total, o.moneda),
          pct(Math.min(100, (total / o.monto) * 100)),
          o.fecha ? fechaCorta(o.fecha) : 'sin fecha',
          porMes,
          o.estado,
        ]
      }),
    ),
  )

  // 8. Detalle
  const grupoDe = (m: { cuenta_id: string; cuenta_destino_id: string | null }) => {
    const c = [m.cuenta_id, m.cuenta_destino_id].map((id) => (id ? ctaPorId.get(id) : undefined)).find((x) => x?.tipo === 'grupo')
    return c ? t(nombreCuenta(c).replace(/^Grupo /, '')) : '—'
  }
  out.push('## 8. Detalle de movimientos del mes')
  out.push('')
  out.push(
    tabla(
      ['Fecha', 'Tipo', 'Categoría', 'Subcategoría', 'Grupo', 'Cuenta', 'Monto', 'Cantidad'],
      delMes.map((m) => [
        fechaCorta(m.fecha),
        m.tipo + (m.cuota_n ? ` (cuota ${m.cuota_n})` : ''),
        m.tipo === 'transferencia' ? (grupoDe(m) !== '—'
            ? 'Movimiento con el grupo'
            : ctaPorId.get(m.cuenta_destino_id ?? '')?.tipo === 'tarjeta'
              ? 'Pago de tarjeta'
              : 'Entre cuentas propias') : nombreCat(m.categoria_id),
        m.activo_id ? t(actPorId.get(m.activo_id)?.nombre ?? '—') : '—',
        grupoDe(m),
        m.tipo === 'transferencia' ? `${t(nomCuenta(m.cuenta_id))} → ${t(nomCuenta(m.cuenta_destino_id))}` : t(nomCuenta(m.cuenta_id)),
        plata(m.monto, m.moneda),
        m.cantidad ? cant(m.cantidad) : '—',
      ]),
    ),
  )
  out.push(`_Fin del reporte de ${nombreMes(mes)}._`)
  return out.join('\n')
}

// ============================================================
// Entregar el texto
// ============================================================

export function descargarTexto(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function copiarTexto(contenido: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(contenido)
    return true
  } catch {
    return false
  }
}
