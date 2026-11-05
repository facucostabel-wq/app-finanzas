import { useCallback, useEffect, useState } from 'react'
import { rangoMes, type Mes, type Moneda } from './format'
import { supabase } from './supabase'

export type TipoCategoria = 'gasto' | 'ingreso' | 'inversion'
export type TipoMovimiento = 'gasto' | 'ingreso' | 'aporte' | 'rescate'
export type FormaPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'billetera'

export type Categoria = {
  id: string
  tipo: TipoCategoria
  nombre: string
  orden: number
  activa: boolean
}

export type Movimiento = {
  id: string
  fecha: string
  tipo: TipoMovimiento
  monto: number
  moneda: Moneda
  categoria_id: string
  forma_pago: FormaPago | null
  nota: string | null
}

export type NuevoMovimiento = Omit<Movimiento, 'id'>

/** Texto para mostrar cada tipo en listas. */
export const TEXTO_TIPO: Record<TipoMovimiento, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  aporte: 'Invertí',
  rescate: 'Retiré de inversión',
}

export const FORMAS_PAGO: { valor: FormaPago; texto: string }[] = [
  { valor: 'debito', texto: 'Débito' },
  { valor: 'credito', texto: 'Crédito' },
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'billetera', texto: 'Billetera virtual' },
]

export const TEXTO_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.texto])) as Record<
  FormaPago,
  string
>

/** Qué tipo de categoría usa cada tipo de movimiento. */
export function tipoCategoriaDe(tipo: TipoMovimiento): TipoCategoria {
  return tipo === 'aporte' || tipo === 'rescate' ? 'inversion' : tipo
}

// RLS garantiza que todas estas consultas devuelven solo datos del usuario logueado.

export function useCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('categorias')
      .select('id, tipo, nombre, orden, activa')
      .order('orden')
      .order('nombre')
    if (error) setError(error.message)
    else setCategorias(data as Categoria[])
    setLoading(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { categorias, loading, error, recargar }
}

export function useMovimientosDelMes(mes: Mes) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    const { desde, hasta } = rangoMes(mes)
    const { data, error } = await supabase
      .from('movimientos')
      .select('id, fecha, tipo, monto, moneda, categoria_id, forma_pago, nota')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('creado_at', { ascending: false })
    if (error) setError(error.message)
    else {
      setError(null)
      // numeric llega como string desde la API: lo pasamos a número.
      setMovimientos((data ?? []).map((m) => ({ ...m, monto: Number(m.monto) })) as Movimiento[])
    }
    setLoading(false)
  }, [mes])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { movimientos, loading, error, recargar }
}

export async function obtenerMovimiento(id: string): Promise<Movimiento | null> {
  const { data } = await supabase
    .from('movimientos')
    .select('id, fecha, tipo, monto, moneda, categoria_id, forma_pago, nota')
    .eq('id', id)
    .maybeSingle()
  return data ? ({ ...data, monto: Number(data.monto) } as Movimiento) : null
}

export type Totales = { ingresos: number; gastos: number; aportes: number; rescates: number }

/** Totales del mes por moneda (sin convertir: cada moneda por separado). */
export function totalesPorMoneda(movs: Movimiento[]): Map<Moneda, Totales> {
  const t = new Map<Moneda, Totales>()
  for (const m of movs) {
    if (!t.has(m.moneda)) t.set(m.moneda, { ingresos: 0, gastos: 0, aportes: 0, rescates: 0 })
    const k = m.tipo === 'gasto' ? 'gastos' : m.tipo === 'ingreso' ? 'ingresos' : m.tipo === 'aporte' ? 'aportes' : 'rescates'
    t.get(m.moneda)![k] += m.monto
  }
  return t
}

/** Ordena monedas: primero las favoritas (en su orden), después el resto alfabéticamente. */
export function ordenarMonedas(monedas: Iterable<Moneda>, favoritas: Moneda[]): Moneda[] {
  const pos = (m: Moneda) => {
    const i = favoritas.indexOf(m)
    return i === -1 ? 999 : i
  }
  return [...monedas].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
}

/** Gastos agrupados por categoría, de mayor a menor. */
export function gastosPorCategoria(movs: Movimiento[], moneda: Moneda, categorias: Categoria[]) {
  const nombres = new Map(categorias.map((c) => [c.id, c.nombre]))
  const acc = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo !== 'gasto' || m.moneda !== moneda) continue
    acc.set(m.categoria_id, (acc.get(m.categoria_id) ?? 0) + m.monto)
  }
  return [...acc.entries()]
    .map(([id, total]) => ({ id, nombre: nombres.get(id) ?? '—', total }))
    .sort((a, b) => b.total - a.total)
}
