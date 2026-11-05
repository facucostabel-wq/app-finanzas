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
 * Interpreta lo que escribe el usuario con convención argentina:
 * "12.345,67" → 12345.67 · "12345,5" → 12345.5 · "12.345" → 12345 · "12.5" → 12.5
 * Devuelve null si no es un número válido mayor a cero.
 */
export function parseMonto(texto: string): number | null {
  let t = texto.replace(/\s|\$|US/gi, '')
  if (!t) return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // puntos como separador de miles
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n > 0 ? n : null
}

/** Monto guardado → texto editable ("12345.5" → "12345,5"). */
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
