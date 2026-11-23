import { useCallback, useEffect, useState } from 'react'
import type { Movimiento } from './datos'
import { supabase } from './supabase'

/** Etiqueta (#bariloche). Con fechas es un evento: mientras dura, se propone sola al cargar. */
export type Etiqueta = { id: string; nombre: string; desde: string | null; hasta: string | null; creado_at: string }
export type Etiquetado = { id: string; etiqueta_id: string; movimiento_id: string | null; compra_id: string | null }

export const esEvento = (e: Etiqueta) => Boolean(e.desde || e.hasta)
/** El evento cubre esa fecha. */
export const vigenteEn = (e: Etiqueta, fecha: string) =>
  esEvento(e) && (!e.desde || e.desde <= fecha) && (!e.hasta || fecha <= e.hasta)

export function useEtiquetas() {
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [etiquetado, setEtiquetado] = useState<Etiquetado[]>([])
  const [falta, setFalta] = useState(false)
  const [loading, setLoading] = useState(true)
  const recargar = useCallback(async () => {
    const [e, t] = await Promise.all([
      supabase.from('etiquetas').select('id, nombre, desde, hasta, creado_at').order('creado_at', { ascending: false }),
      supabase.from('etiquetado').select('id, etiqueta_id, movimiento_id, compra_id'),
    ])
    setFalta(Boolean(e.error))
    setEtiquetas((e.data ?? []) as Etiqueta[])
    setEtiquetado((t.data ?? []) as Etiquetado[])
    setLoading(false)
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])

  /** Etiquetas de un movimiento: las propias y, si es una cuota, las de su compra. */
  const deMovimiento = useCallback(
    (m: Pick<Movimiento, 'id' | 'compra_id'>) => {
      const ids = new Set(
        etiquetado.filter((x) => x.movimiento_id === m.id || (m.compra_id && x.compra_id === m.compra_id)).map((x) => x.etiqueta_id),
      )
      return etiquetas.filter((e) => ids.has(e.id))
    },
    [etiquetas, etiquetado],
  )
  return { etiquetas, etiquetado, falta, loading, recargar, deMovimiento }
}

/** Crea una etiqueta (o devuelve la existente con ese nombre). */
export async function crearEtiqueta(nombre: string, desde: string | null = null, hasta: string | null = null) {
  const limpio = nombre.replace(/^#/, '').trim()
  const { data, error } = await supabase.from('etiquetas').insert({ nombre: limpio, desde, hasta }).select('id, nombre, desde, hasta, creado_at').single()
  if (error?.code === '23505') {
    const { data: ya } = await supabase.from('etiquetas').select('id, nombre, desde, hasta, creado_at').ilike('nombre', limpio).maybeSingle()
    return { etiqueta: (ya as Etiqueta) ?? null, error: ya ? null : error.message }
  }
  return { etiqueta: (data as Etiqueta) ?? null, error: error?.message ?? null }
}

/** Reemplaza las etiquetas de un movimiento o de una compra en cuotas. */
export async function guardarEtiquetado(destino: { movimiento_id?: string; compra_id?: string }, etiquetaIds: string[]) {
  const col = destino.movimiento_id ? 'movimiento_id' : 'compra_id'
  const valor = destino.movimiento_id ?? destino.compra_id!
  const { error: e1 } = await supabase.from('etiquetado').delete().eq(col, valor)
  if (e1) return e1.message
  if (!etiquetaIds.length) return null
  const { error } = await supabase.from('etiquetado').insert(etiquetaIds.map((etiqueta_id) => ({ etiqueta_id, [col]: valor })))
  return error?.message ?? null
}
