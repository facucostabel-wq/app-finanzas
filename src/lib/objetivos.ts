import { useCallback, useEffect, useState } from 'react'
import { convertir, type Cierre, type Tipos } from './cotizaciones'
import { esCuentaDisponible, type Activo, type Cuenta, type SaldoInicial } from './datos'
import type { Moneda } from './format'
import { nombreCortoMoneda } from './monedas'
import { supabase } from './supabase'
import type { Tenencia } from './tenencias'

export type EstadoObjetivo = 'activo' | 'pausado' | 'cumplido'

export type Objetivo = {
  id: string
  nombre: string
  icono: string | null
  monto: number
  moneda: Moneda
  fecha: string | null
  estado: EstadoObjetivo
  cumplido_at: string | null
  creado_at: string
}
/** moneda: solo esa moneda de la cuenta; null = la cuenta entera. */
export type Vinculo = { id: string; objetivo_id: string; cuenta_id: string | null; activo_id: string | null; moneda: string | null }
export type Aporte = {
  id: string
  objetivo_id: string
  fecha: string
  monto: number
  moneda: Moneda
  cuenta_id: string | null
  nota: string | null
}

export function useObjetivos() {
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [aportes, setAportes] = useState<Aporte[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const [o, v, a] = await Promise.all([
      supabase.from('objetivos').select('id, nombre, icono, monto, moneda, fecha, estado, cumplido_at, creado_at').order('creado_at'),
      supabase
        .from('objetivo_vinculos')
        .select('id, objetivo_id, cuenta_id, activo_id, moneda')
        .then(async (r) =>
          // Base sin la columna de moneda todavía: se lee igual (todo como cuenta entera).
          r.error?.code === '42703' ? await supabase.from('objetivo_vinculos').select('id, objetivo_id, cuenta_id, activo_id') : r,
        ),
      supabase.from('objetivo_aportes').select('id, objetivo_id, fecha, monto, moneda, cuenta_id, nota').order('fecha'),
    ])
    if (o.error) setError(o.error.message)
    else setError(null)
    setObjetivos(((o.data ?? []) as Objetivo[]).map((x) => ({ ...x, monto: Number(x.monto) })))
    setVinculos(((v.data ?? []) as Partial<Vinculo>[]).map((x) => ({ moneda: null, ...x }) as Vinculo))
    setAportes(((a.data ?? []) as Aporte[]).map((x) => ({ ...x, monto: Number(x.monto) })))
    setLoading(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { objetivos, vinculos, aportes, loading, error, recargar }
}

/** Lo que hace falta para valuar las fuentes de un objetivo. */
export type Contexto = {
  cuentas: Cuenta[]
  saldos: SaldoInicial[]
  activos: Activo[]
  tenencias: Tenencia[]
  tipos: Tipos
  ultimoCierre?: Cierre
}

export type Fuente = {
  clave: string
  tipo: 'apartado' | 'cuenta' | 'activo'
  nombre: string
  /** Valor en la moneda del objetivo (null si falta una cotización para convertirlo). */
  valor: number | null
  /** Detalle legible del valor en su moneda original. */
  original: { monto: number; moneda: Moneda }[]
  /** Valuado a lo que costó porque todavía no hay precio de cierre. */
  alCosto?: boolean
}

export type Progreso = {
  total: number
  fuentes: Fuente[]
  /** Alguna fuente no se pudo convertir (falta el tipo de cambio). */
  faltaTipo: boolean
  alCosto: boolean
  porcentaje: number
}

/** Valor de una tenencia: divisas a la par, el resto con el precio del último cierre o al costo. */
function valorTenencia(t: Tenencia, activo: Activo | undefined, ctx: Contexto) {
  if (activo?.divisa) return { monto: t.cantidad, moneda: activo.divisa, alCosto: false }
  const precio = ctx.ultimoCierre?.precios.get(t.activo_id ?? `cat:${t.categoria_id}`)
  if (precio) return { monto: t.cantidad * precio.precio, moneda: precio.moneda, alCosto: false }
  return { monto: t.costo, moneda: t.moneda, alCosto: true }
}

export function calcularProgreso(obj: Objetivo, vinculos: Vinculo[], aportes: Aporte[], ctx: Contexto): Progreso {
  const fuentes: Fuente[] = []
  const conv = (m: number, de: Moneda) => convertir(m, de, obj.moneda, ctx.tipos)

  // Apartados a mano, netos por moneda.
  const porMoneda = new Map<Moneda, number>()
  for (const a of aportes.filter((x) => x.objetivo_id === obj.id)) porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? 0) + a.monto)
  const apartados = [...porMoneda].filter(([, v]) => Math.abs(v) >= 0.01)
  if (apartados.length) {
    const vals = apartados.map(([m, v]) => conv(v, m))
    fuentes.push({
      clave: 'apartado',
      tipo: 'apartado',
      nombre: 'Apartado a mano',
      valor: vals.some((v) => v === null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0),
      original: apartados.map(([moneda, monto]) => ({ monto, moneda })),
    })
  }

  for (const v of vinculos.filter((x) => x.objetivo_id === obj.id)) {
    if (v.cuenta_id) {
      const cuenta = ctx.cuentas.find((c) => c.id === v.cuenta_id)
      const sal = ctx.saldos.filter((s) => s.cuenta_id === v.cuenta_id && s.monto > 0.005 && (!v.moneda || s.moneda === v.moneda))
      const vals = sal.map((s) => conv(s.monto, s.moneda))
      fuentes.push({
        clave: v.id,
        tipo: 'cuenta',
        nombre: `${cuenta?.nombre ?? 'Cuenta'}${v.moneda ? ` · ${nombreCortoMoneda(v.moneda)}` : ''}`,
        valor: vals.some((x) => x === null) ? null : vals.reduce<number>((s, x) => s + (x ?? 0), 0),
        original: sal.map((s) => ({ monto: s.monto, moneda: s.moneda })),
      })
    } else if (v.activo_id) {
      const activo = ctx.activos.find((a) => a.id === v.activo_id)
      const ts = ctx.tenencias.filter((t) => t.activo_id === v.activo_id && t.cantidad > 0)
      const valores = ts.map((t) => valorTenencia(t, activo, ctx))
      const vals = valores.map((x) => conv(x.monto, x.moneda))
      fuentes.push({
        clave: v.id,
        tipo: 'activo',
        nombre: activo?.nombre ?? 'Inversión',
        valor: vals.some((x) => x === null) ? null : vals.reduce<number>((s, x) => s + (x ?? 0), 0),
        original: valores.map((x) => ({ monto: x.monto, moneda: x.moneda })),
        alCosto: valores.some((x) => x.alCosto),
      })
    }
  }

  const total = Math.max(0, fuentes.reduce((s, f) => s + (f.valor ?? 0), 0))
  return {
    total,
    fuentes,
    faltaTipo: fuentes.some((f) => f.valor === null),
    alCosto: fuentes.some((f) => f.alCosto),
    porcentaje: Math.min(100, (total / obj.monto) * 100),
  }
}

const mesesEntre = (desde: Date, hasta: Date) =>
  (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth()) + (hasta.getDate() >= desde.getDate() ? 0 : -1)

export type Plan =
  | { tipo: 'cumplido' }
  | { tipo: 'con-fecha'; meses: number; porMes: number; estado: 'adelantado' | 'al-dia' | 'atrasado' | 'vencido'; esperado: number }
  | { tipo: 'sin-fecha'; ritmo: number | null; llegada: Date | null }

/**
 * Con fecha: cuánto separar por mes y si vas al día (contra un avance parejo desde que
 * lo creaste). Sin fecha: a qué ritmo venís (según los cierres o lo apartado) y cuándo llegás.
 */
export function calcularPlan(obj: Objetivo, progreso: Progreso, aportes: Aporte[], cierres: Cierre[]): Plan {
  const falta = Math.max(0, obj.monto - progreso.total)
  if (falta < 0.01) return { tipo: 'cumplido' }
  const hoy = new Date()

  if (obj.fecha) {
    const fin = new Date(`${obj.fecha}T12:00:00`)
    const meses = Math.max(0, mesesEntre(hoy, fin))
    const inicio = new Date(obj.creado_at)
    const totalDias = Math.max(1, (fin.getTime() - inicio.getTime()) / 86400000)
    const pasados = Math.min(totalDias, Math.max(0, (hoy.getTime() - inicio.getTime()) / 86400000))
    const esperado = (obj.monto * pasados) / totalDias
    const margen = obj.monto * 0.03
    const estado =
      fin < hoy ? 'vencido' : progreso.total >= esperado + margen ? 'adelantado' : progreso.total >= esperado - margen ? 'al-dia' : 'atrasado'
    return { tipo: 'con-fecha', meses, porMes: falta / Math.max(1, meses), estado, esperado }
  }

  // Ritmo: avance entre cierres de los últimos meses; si no hay, lo apartado a mano.
  let ritmo: number | null = null
  const fotos = cierres.filter((c) => c.objetivos.has(obj.id)).slice(0, 4)
  if (fotos.length >= 2) {
    const nueva = fotos[0]
    const vieja = fotos[fotos.length - 1]
    const meses = mesesEntre(new Date(`${vieja.mes}T12:00:00`), new Date(`${nueva.mes}T12:00:00`))
    if (meses > 0) ritmo = (nueva.objetivos.get(obj.id)! - vieja.objetivos.get(obj.id)!) / meses
  }
  if (ritmo === null) {
    const hace3 = new Date(hoy.getFullYear(), hoy.getMonth() - 3, hoy.getDate()).toISOString().slice(0, 10)
    const recientes = aportes.filter((a) => a.objetivo_id === obj.id && a.fecha >= hace3 && a.moneda === obj.moneda)
    if (recientes.length) ritmo = recientes.reduce((s, a) => s + a.monto, 0) / 3
  }
  const llegada =
    ritmo && ritmo > 0 ? new Date(hoy.getFullYear(), hoy.getMonth() + Math.ceil(falta / ritmo), 1) : null
  return { tipo: 'sin-fecha', ritmo, llegada }
}

/**
 * Plata reservada para objetivos activos o pausados que hoy está en cuentas "para gastar"
 * (banco, billetera, efectivo), por moneda. Se descuenta del disponible del Resumen.
 */
export function reservadoEnDisponible(
  objetivos: Objetivo[],
  vinculos: Vinculo[],
  aportes: Aporte[],
  cuentas: Cuenta[],
  saldos: SaldoInicial[],
): Map<Moneda, number> {
  const vigentes = new Set(objetivos.filter((o) => o.estado !== 'cumplido').map((o) => o.id))
  const tipo = new Map(cuentas.map((c) => [c.id, c.tipo]))
  const res = new Map<Moneda, number>()
  const sumar = (m: Moneda, v: number) => res.set(m, (res.get(m) ?? 0) + v)

  for (const v of vinculos) {
    if (!vigentes.has(v.objetivo_id) || !v.cuenta_id) continue
    const t = tipo.get(v.cuenta_id)
    if (!t || !esCuentaDisponible(t)) continue
    for (const s of saldos)
      if (s.cuenta_id === v.cuenta_id && s.monto > 0 && (!v.moneda || s.moneda === v.moneda)) sumar(s.moneda, s.monto)
  }
  // Apartados: netos por objetivo y moneda, nunca negativos.
  const neto = new Map<string, number>()
  for (const a of aportes) {
    if (!vigentes.has(a.objetivo_id) || !a.cuenta_id) continue
    const t = tipo.get(a.cuenta_id)
    if (!t || !esCuentaDisponible(t)) continue
    const k = `${a.objetivo_id}|${a.moneda}`
    neto.set(k, (neto.get(k) ?? 0) + a.monto)
  }
  for (const [k, v] of neto) if (v > 0) sumar(k.split('|')[1], v)
  return res
}

/** ¿Esa moneda de esa cuenta ya está destinada (entera o por moneda) a algún objetivo? */
export function estaDestinada(vinculos: Vinculo[], cuentaId: string, moneda?: string | null) {
  return vinculos.some((v) => v.cuenta_id === cuentaId && (!v.moneda || !moneda || v.moneda === moneda))
}
