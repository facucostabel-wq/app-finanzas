import type { Moneda } from './format'
import type { Movimiento } from './datos'

export type Tenencia = {
  clave: string
  categoria_id: string
  activo_id: string | null
  moneda: Moneda
  /** Unidades que quedan en cartera. */
  cantidad: number
  /** Precio promedio ponderado de compra (solo cambia con compras). */
  ppp: number
  /** Costo de las unidades que quedan (cantidad × PPP). */
  costo: number
  /** Resultado de las ventas: lo cobrado menos su costo al PPP. */
  resultadoRealizado: number
  /** Movimientos de este activo cargados sin cantidad (no entran en el cálculo). */
  sinCantidad: number
}

/**
 * Tenencia y PPP por activo y moneda. Método de precio promedio ponderado:
 * las compras recalculan el PPP; las ventas bajan la cantidad al PPP vigente
 * (sin cambiarlo) y generan resultado realizado.
 */
export function calcularTenencias(movs: Movimiento[]): Tenencia[] {
  const mapa = new Map<string, Tenencia>()
  for (const m of movs) {
    if (!m.categoria_id) continue
    const clave = `${m.activo_id ?? `cat:${m.categoria_id}`}|${m.moneda}`
    let t = mapa.get(clave)
    if (!t) {
      t = {
        clave,
        categoria_id: m.categoria_id,
        activo_id: m.activo_id,
        moneda: m.moneda,
        cantidad: 0,
        ppp: 0,
        costo: 0,
        resultadoRealizado: 0,
        sinCantidad: 0,
      }
      mapa.set(clave, t)
    }
    if (!m.cantidad) {
      t.sinCantidad++
      continue
    }
    if (m.tipo === 'aporte') {
      t.costo += m.monto
      t.cantidad += m.cantidad
      t.ppp = t.costo / t.cantidad
    } else {
      const vendida = Math.min(m.cantidad, t.cantidad)
      t.resultadoRealizado += m.monto - vendida * t.ppp
      t.cantidad -= vendida
      t.costo = t.cantidad * t.ppp
      if (t.cantidad < 1e-12) {
        t.cantidad = 0
        t.costo = 0
      }
    }
  }
  return [...mapa.values()]
}
