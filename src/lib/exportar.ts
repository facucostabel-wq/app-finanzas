import { supabase } from './supabase'

// Todo lo que la base deja ver al usuario (sus datos y los de sus grupos).
const TABLAS = [
  'perfiles',
  'cuentas',
  'saldos_iniciales',
  'categorias',
  'activos',
  'movimientos',
  'compras_cuotas',
  'grupos',
  'grupo_miembros',
  'gastos_grupo',
  'divisiones',
  'liquidaciones',
  'notificaciones',
  'objetivos',
  'objetivo_vinculos',
  'objetivo_aportes',
  'cierres',
  'cierre_tipos',
  'cierre_precios',
  'cierre_objetivos',
] as const

type Fila = Record<string, unknown>

async function leerTabla(tabla: string): Promise<Fila[] | null> {
  const filas: Fila[] = []
  const PAGINA = 1000
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase.from(tabla).select('*').range(desde, desde + PAGINA - 1)
    if (error) return filas.length ? filas : null // tabla que todavía no existe en esta base
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) return filas
  }
}

function descargar(nombre: string, contenido: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

const celda = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
// Excel en castellano: separador ";" y coma decimal.
const numero = (v: unknown) => (v == null || v === '' ? '' : String(v).replace('.', ','))

export async function exportarDatos(email: string | undefined) {
  const datos: Record<string, Fila[]> = {}
  for (const t of TABLAS) {
    const filas = await leerTabla(t)
    if (filas) datos[t] = filas
  }
  const hoy = new Date().toISOString().slice(0, 10)

  descargar(
    `finanzas-datos-${hoy}.json`,
    JSON.stringify({ exportado: new Date().toISOString(), cuenta: email, datos }, null, 2),
    'application/json',
  )

  // Movimientos en una planilla legible.
  const nombre = (tabla: string, id: unknown) =>
    (datos[tabla]?.find((f) => f.id === id)?.nombre as string | undefined) ?? ''
  const movs = [...(datos.movimientos ?? [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const lineas = [
    ['Fecha', 'Tipo', 'Categoría', 'Subcategoría', 'Cuenta', 'Cuenta destino', 'Monto', 'Moneda', 'Cantidad', 'Cuota', 'Nota'].join(';'),
    ...movs.map((m) =>
      [
        m.fecha,
        m.tipo,
        nombre('categorias', m.categoria_id),
        nombre('activos', m.activo_id),
        nombre('cuentas', m.cuenta_id),
        nombre('cuentas', m.cuenta_destino_id),
        numero(m.monto),
        m.moneda,
        numero(m.cantidad),
        m.cuota_n ?? '',
        m.nota,
      ]
        .map(celda)
        .join(';'),
    ),
  ]
  descargar(`finanzas-movimientos-${hoy}.csv`, '﻿' + lineas.join('\r\n'), 'text/csv;charset=utf-8')

  return Object.values(datos).reduce((n, f) => n + f.length, 0)
}
