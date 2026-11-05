/** Código ISO 4217 de 3 letras: ARS, USD, EUR… */
export type Moneda = string

const formatos = new Map<string, Intl.NumberFormat>()

/** $ 12.345,5 / US$ 100 / € 50 */
export function formatMonto(monto: number, moneda: Moneda): string {
  let f = formatos.get(moneda)
  if (!f) {
    try {
      f = new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, minimumFractionDigits: 0, maximumFractionDigits: 2 })
    } catch {
      f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }
    formatos.set(moneda, f)
  }
  return f.format(monto)
}

/**
 * Interpreta un número escrito con convención argentina:
 * "12.345,67" → 12345.67 · "12345,5" → 12345.5 · "12.345" → 12345 · "0.0015" → 0.0015
 * Devuelve null si no es un número válido mayor a cero o tiene más decimales de los permitidos.
 */
export function parseNumero(texto: string, maxDecimales: number): number | null {
  let t = texto.replace(/\s|\$|US/gi, '')
  if (!t) return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // puntos como separador de miles ("12.345")
  }
  const re = new RegExp(`^\\d+(\\.\\d{1,${maxDecimales}})?$`)
  if (!re.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}

/** Montos: hasta 2 decimales. */
export const parseMonto = (texto: string) => parseNumero(texto, 2)

/** Cantidades (BTC, CEDEARs, cuotapartes): hasta 10 decimales. */
export const parseCantidad = (texto: string) => parseNumero(texto, 10)

const fmtCantidad = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 10 })

/** 0,0015 · 1.250 · 12,5 */
export function formatCantidad(n: number): string {
  return fmtCantidad.format(n)
}

/** Precio por unidad: con más decimales cuando es menor a 1 (ej. cripto chicas). */
export function formatPrecio(precio: number, moneda: Moneda): string {
  if (precio >= 1) return formatMonto(Math.round(precio * 100) / 100, moneda)
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumSignificantDigits: 4 }).format(precio)
  } catch {
    return String(precio)
  }
}

/** Número guardado → texto editable ("12345.5" → "12345,5"). */
export function montoAEditable(monto: number): string {
  return String(monto).replace('.', ',')
}

/** Fecha local de hoy en formato YYYY-MM-DD. */
export function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mes como "YYYY-MM". */
export type Mes = string

export function mesActual(): Mes {
  return hoyISO().slice(0, 7)
}

export function moverMes(mes: Mes, delta: number): Mes {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Rango [desde, hasta) del mes para consultar por fecha. */
export function rangoMes(mes: Mes): { desde: string; hasta: string } {
  return { desde: `${mes}-01`, hasta: `${moverMes(mes, 1)}-01` }
}

export function nombreMes(mes: Mes): string {
  const [y, m] = mes.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "2026-11-04" → "Miércoles 4" (para encabezados de día). */
export function nombreDia(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const s = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
