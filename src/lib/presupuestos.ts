import { useCallback, useEffect, useState } from 'react'
import { convertir, type Tipos } from './cotizaciones'
import type { Movimiento } from './datos'
import type { Moneda } from './format'
import { supabase } from './supabase'

/**
 * Presupuesto mensual: por categoría de gasto o general (categoria_id null).
 * Monto fijo, o un % de lo que ingresó en el mes. Cada mes arranca de cero.
 */
export type Presupuesto = {
  id: string
  categoria_id: string | null
  tipo: 'monto' | 'porcentaje'
  monto: number | null
  porcentaje: number | null
  moneda: Moneda
}

export function usePresupuestos() {
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [falta, setFalta] = useState(false)
  const [loading, setLoading] = useState(true)
  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('presupuestos').select('id, categoria_id, tipo, monto, porcentaje, moneda')
    setFalta(Boolean(error))
    setPresupuestos(
      ((data ?? []) as Presupuesto[]).map((p) => ({
        ...p,
        monto: p.monto === null ? null : Number(p.monto),
        porcentaje: p.porcentaje === null ? null : Number(p.porcentaje),
      })),
    )
    setLoading(false)
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { presupuestos, falta, loading, recargar }
}

export async function guardarPresupuesto(p: Omit<Presupuesto, 'id'> & { id?: string }) {
  const fila = {
    categoria_id: p.categoria_id,
    tipo: p.tipo,
    monto: p.tipo === 'monto' ? p.monto : null,
    porcentaje: p.tipo === 'porcentaje' ? p.porcentaje : null,
    moneda: p.moneda,
  }
  const { error } = p.id
    ? await supabase.from('presupuestos').update(fila).eq('id', p.id)
    : await supabase.from('presupuestos').insert(fila)
  return error?.message ?? null
}

export async function borrarPresupuesto(id: string) {
  const { error } = await supabase.from('presupuestos').delete().eq('id', id)
  return error?.message ?? null
}

/** Suma en la moneda pedida; lo de otras monedas se convierte si hay cotización (si no, queda afuera). */
function sumar(movs: Movimiento[], moneda: Moneda, tipos: Tipos) {
  let total = 0
  let sinConvertir = false
  for (const m of movs) {
    const v = convertir(m.monto, m.moneda, moneda, tipos)
    if (v === null) sinConvertir = true
    else total += v
  }
  return { total, sinConvertir }
}

export type Estado = {
  presupuesto: Presupuesto
  /** Monto presupuestado este mes (para los de %, según lo que ingresó). */
  limite: number
  gastado: number
  /** gastado ÷ límite (null si el límite es 0). */
  uso: number | null
  ingresos: number
  sinConvertir: boolean
}

/**
 * Cómo viene cada presupuesto con los movimientos de un mes. Cuentan todos los gastos de la
 * categoría (incluida tu parte de gastos de grupo y las cuotas que vencen ese mes).
 */
export function estadoPresupuestos(presupuestos: Presupuesto[], movsMes: Movimiento[], tipos: Tipos): Estado[] {
  const gastos = movsMes.filter((m) => m.tipo === 'gasto')
  const ingresos = movsMes.filter((m) => m.tipo === 'ingreso')
  return presupuestos.map((p) => {
    const ing = sumar(ingresos, p.moneda, tipos)
    const gas = sumar(p.categoria_id ? gastos.filter((g) => g.categoria_id === p.categoria_id) : gastos, p.moneda, tipos)
    const limite = p.tipo === 'monto' ? (p.monto ?? 0) : ((p.porcentaje ?? 0) / 100) * ing.total
    return {
      presupuesto: p,
      limite,
      gastado: gas.total,
      uso: limite > 0 ? gas.total / limite : null,
      ingresos: ing.total,
      sinConvertir: gas.sinConvertir || (p.tipo === 'porcentaje' && ing.sinConvertir),
    }
  })
}

/** Nivel para el color: bien (<80%), cerca (80–100%), pasado (>100%). */
export const nivel = (uso: number | null) => (uso === null ? 'bien' : uso > 1 ? 'pasado' : uso >= 0.8 ? 'cerca' : 'bien')
