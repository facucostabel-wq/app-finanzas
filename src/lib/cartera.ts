import { useCallback, useEffect, useState } from 'react'
import { convertir, type Cierre, type Tipos } from './cotizaciones'
import type { Activo, Categoria, Movimiento } from './datos'
import type { Moneda } from './format'
import { supabase } from './supabase'

/** Valor cargado a mano para una inversión (precio por unidad o total). */
export type Valuacion = { clave: string; precio: number | null; total: number | null; moneda: Moneda; actualizado_at: string }

export function useValuaciones() {
  const [valuaciones, setValuaciones] = useState<Valuacion[]>([])
  const [falta, setFalta] = useState(false)
  const recargar = useCallback(async () => {
    const { data, error } = await supabase.from('valuaciones').select('clave, precio, total, moneda, actualizado_at')
    setFalta(Boolean(error))
    setValuaciones(
      ((data ?? []) as Valuacion[]).map((v) => ({
        ...v,
        precio: v.precio === null ? null : Number(v.precio),
        total: v.total === null ? null : Number(v.total),
      })),
    )
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { valuaciones, falta, recargar }
}

export async function guardarValuacion(v: { clave: string; precio: number | null; total: number | null; moneda: Moneda }) {
  const { error } = await supabase
    .from('valuaciones')
    .upsert({ ...v, actualizado_at: new Date().toISOString() }, { onConflict: 'usuario_id,clave' })
  return error?.message ?? null
}

export type FuenteValor = 'auto' | 'manual' | 'cierre' | 'costo'

export type Posicion = {
  /** id del activo, o "cat:<id>" si se cargó sin subcategoría. */
  clave: string
  categoria_id: string
  activo_id: string | null
  nombre: string
  divisa: Moneda | null
  /** Unidades en cartera (0 si se cargó solo por monto). */
  cantidad: number
  porMonto: boolean
  /** Lo que costó lo que queda, en dólares (cada compra al MEP de su día). */
  costoUsd: number
  pppUsd: number | null
  /** Ganancia o pérdida ya realizada por ventas, en dólares. */
  realizadoUsd: number
  valorUsd: number
  fuente: FuenteValor
  /** Fecha del valor (ISO), si no es automático. */
  valorFecha: string | null
  /** Precio por unidad actual (en USD), si se sabe. */
  precioUsd: number | null
  resultadoUsd: number
  porcentaje: number | null
  /** Alguna conversión usó el dólar de hoy en vez del de la fecha. */
  aproximado: boolean
  movimientos: Movimiento[]
}

type Contexto = {
  activos: Activo[]
  categorias: Categoria[]
  tipos: Tipos
  mepEn: ((fecha: string) => number | null) | null
  valuaciones: Valuacion[]
  ultimoCierre?: Cierre
}

const claveDe = (m: Movimiento) => m.activo_id ?? `cat:${m.categoria_id}`

/** Fin del mes de un cierre ("2026-10-01" → "2026-10-31T23:59"). */
const finDeMes = (mes: string) => {
  const [y, m] = mes.slice(0, 7).split('-').map(Number)
  return new Date(Date.UTC(y, m, 0, 23, 59)).toISOString()
}

/**
 * Posiciones de la cartera en dólares. El costo usa el dólar MEP del día de cada
 * movimiento; el valor actual sale de (en este orden): la cotización de la moneda (solo
 * monedas extranjeras), el valor más reciente entre lo cargado a mano y el último cierre,
 * o el costo. Los precios de las inversiones los carga el usuario, nunca se traen solos.
 */
export function armarCartera(movs: Movimiento[], ctx: Contexto): Posicion[] {
  const { tipos, mepEn } = ctx
  const mepHoy = tipos.get('USD') ?? null
  const posiciones = new Map<string, Posicion>()

  const aUsd = (monto: number, moneda: Moneda, fecha: string): { v: number; aprox: boolean } | null => {
    if (moneda === 'USD') return { v: monto, aprox: false }
    if (moneda === 'ARS') {
      const mep = mepEn?.(fecha) ?? null
      if (mep) return { v: monto / mep, aprox: false }
      return mepHoy ? { v: monto / mepHoy, aprox: true } : null
    }
    const v = convertir(monto, moneda, 'USD', tipos)
    return v === null ? null : { v, aprox: true }
  }

  const ordenados = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const m of ordenados) {
    if (!m.categoria_id) continue
    const clave = claveDe(m)
    let p = posiciones.get(clave)
    if (!p) {
      const activo = m.activo_id ? ctx.activos.find((a) => a.id === m.activo_id) : undefined
      const cat = ctx.categorias.find((c) => c.id === m.categoria_id)
      p = {
        clave,
        categoria_id: m.categoria_id,
        activo_id: m.activo_id,
        nombre: activo?.nombre ?? `${cat?.nombre ?? 'Inversión'} (general)`,
        divisa: activo?.divisa ?? null,
        cantidad: 0,
        porMonto: false,
        costoUsd: 0,
        pppUsd: null,
        realizadoUsd: 0,
        valorUsd: 0,
        fuente: 'costo',
        valorFecha: null,
        precioUsd: null,
        resultadoUsd: 0,
        porcentaje: null,
        aproximado: false,
        movimientos: [],
      }
      posiciones.set(clave, p)
    }
    p.movimientos.push(m)
    const usd = aUsd(m.monto, m.moneda, m.fecha)
    if (!usd) continue
    if (usd.aprox) p.aproximado = true

    if (m.cantidad) {
      if (m.tipo === 'aporte') {
        p.costoUsd += usd.v
        p.cantidad += m.cantidad
      } else {
        const ppp = p.cantidad > 0 ? p.costoUsd / p.cantidad : 0
        const vendida = Math.min(m.cantidad, p.cantidad)
        p.realizadoUsd += usd.v - vendida * ppp
        p.cantidad -= vendida
        p.costoUsd = p.cantidad * ppp
        if (p.cantidad < 1e-12) {
          p.cantidad = 0
          p.costoUsd = 0
        }
      }
    } else {
      // Cargado solo por monto (por ejemplo, un FCI sin cuotapartes).
      p.porMonto = true
      if (m.tipo === 'aporte') p.costoUsd += usd.v
      else {
        const sale = Math.min(usd.v, p.costoUsd)
        p.realizadoUsd += usd.v - sale
        p.costoUsd -= sale
      }
    }
  }

  for (const p of posiciones.values()) {
    p.pppUsd = p.cantidad > 0 ? p.costoUsd / p.cantidad : null
    let valor: number | null = null

    // 1) Monedas extranjeras: valen lo que vale la moneda.
    if (p.divisa && p.cantidad > 0) {
      valor = convertir(p.cantidad, p.divisa, 'USD', tipos)
      if (valor !== null) {
        p.fuente = 'auto'
        p.precioUsd = valor / p.cantidad
      }
    }

    // 2) El valor más reciente entre lo cargado a mano y el último cierre.
    if (valor === null) {
      const manual = ctx.valuaciones.find((v) => v.clave === p.clave)
      const cierre = ctx.ultimoCierre?.precios.get(p.clave)
      const fechaCierre = ctx.ultimoCierre ? finDeMes(ctx.ultimoCierre.mes) : null
      const usarManual = manual && (!cierre || !fechaCierre || manual.actualizado_at >= fechaCierre)
      if (usarManual && manual) {
        if (manual.precio !== null && p.cantidad > 0) {
          const precio = convertir(manual.precio, manual.moneda, 'USD', tipos)
          if (precio !== null) {
            p.precioUsd = precio
            valor = p.cantidad * precio
          }
        } else if (manual.total !== null) {
          // Valor total a esa fecha + lo que entró o salió después.
          const base = convertir(manual.total, manual.moneda, 'USD', tipos)
          if (base !== null) {
            const despues = p.movimientos.filter((m) => m.fecha > manual.actualizado_at.slice(0, 10))
            let flujo = 0
            for (const m of despues) {
              const u = aUsd(m.monto, m.moneda, m.fecha)
              if (u) flujo += m.tipo === 'aporte' ? u.v : -u.v
            }
            valor = Math.max(0, base + flujo)
            if (p.cantidad > 0) p.precioUsd = valor / p.cantidad
          }
        }
        if (valor !== null) {
          p.fuente = 'manual'
          p.valorFecha = manual.actualizado_at
        }
      } else if (cierre && p.cantidad > 0) {
        const precio = convertir(cierre.precio, cierre.moneda, 'USD', tipos)
        if (precio !== null) {
          p.precioUsd = precio
          valor = p.cantidad * precio
          p.fuente = 'cierre'
          p.valorFecha = fechaCierre
        }
      }
    }

    // 3) Sin valor: cuenta por lo que costó.
    if (valor === null) {
      valor = p.costoUsd
      p.fuente = 'costo'
    }
    p.valorUsd = valor
    p.resultadoUsd = p.fuente === 'costo' ? 0 : valor - p.costoUsd
    p.porcentaje = p.fuente !== 'costo' && p.costoUsd > 0.005 ? (p.resultadoUsd / p.costoUsd) * 100 : null
  }

  return [...posiciones.values()]
}

export type Totales = {
  costoUsd: number
  valorUsd: number
  resultadoUsd: number
  porcentaje: number | null
  realizadoUsd: number
  sinValor: number
  porCategoria: { categoria_id: string; valorUsd: number }[]
}

export function totalesCartera(pos: Posicion[]): Totales {
  const abiertas = pos.filter((p) => p.cantidad > 0 || (p.porMonto && p.costoUsd > 0.005) || p.valorUsd > 0.005)
  const costoUsd = abiertas.reduce((t, p) => t + p.costoUsd, 0)
  const valorUsd = abiertas.reduce((t, p) => t + p.valorUsd, 0)
  // El % se mide sobre lo que tiene valor actualizado (lo que cuenta al costo daría 0%).
  const valuadas = abiertas.filter((p) => p.fuente !== 'costo')
  const costoValuado = valuadas.reduce((t, p) => t + p.costoUsd, 0)
  const resultadoUsd = valuadas.reduce((t, p) => t + p.resultadoUsd, 0)
  const cats = new Map<string, number>()
  for (const p of abiertas) cats.set(p.categoria_id, (cats.get(p.categoria_id) ?? 0) + p.valorUsd)
  return {
    costoUsd,
    valorUsd,
    resultadoUsd,
    porcentaje: costoValuado > 0.005 ? (resultadoUsd / costoValuado) * 100 : null,
    realizadoUsd: pos.reduce((t, p) => t + p.realizadoUsd, 0),
    sinValor: abiertas.length - valuadas.length,
    porCategoria: [...cats].map(([categoria_id, valorUsd]) => ({ categoria_id, valorUsd })).sort((a, b) => b.valorUsd - a.valorUsd),
  }
}

/** "hace 3 días", "hoy", "el 31/10". */
export function haceCuanto(iso: string | null): string {
  if (!iso) return ''
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 30) return `hace ${dias} días`
  return `el ${new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })}`
}
