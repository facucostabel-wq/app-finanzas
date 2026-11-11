import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './auth'
import type { Moneda } from './format'
import { supabase } from './supabase'

export type Grupo = { id: string; nombre: string; moneda: Moneda; invitacion_token: string; creado_por: string; admin_id?: string | null }
/** removido_at: ex miembro (sin acceso, pero su historial sigue en el grupo). */
export type Miembro = { id: string; grupo_id: string; usuario_id: string | null; nombre: string; removido_at?: string | null; unido_at?: string | null }
export type GastoGrupo = {
  id: string
  grupo_id: string
  descripcion: string
  fecha: string
  monto: number
  moneda: Moneda
  pagado_por: string
  modo: 'iguales' | 'montos' | 'porcentajes'
  creado_por: string
}
export type Division = { gasto_id: string; miembro_id: string; monto: number }
export type Pago = {
  id: string
  grupo_id: string
  de_miembro: string
  a_miembro: string
  monto: number
  moneda: Moneda
  fecha: string
  creado_por: string
}
/** Movimiento personal vinculado a algo del grupo (solo los míos, por RLS). */
export type Vinculo = {
  id: string
  tipo: string
  monto: number
  gasto_grupo_id: string | null
  liquidacion_id: string | null
}

const num = <T extends { monto: unknown }>(x: T) => ({ ...x, monto: Number(x.monto) })

/** Mis grupos, con mi id de miembro en cada uno. */
export function useGrupos() {
  const { session } = useAuth()
  const [grupos, setGrupos] = useState<(Grupo & { miMiembro: string })[]>([])
  const [loading, setLoading] = useState(true)
  const recargar = useCallback(async () => {
    const uid = session?.user.id
    if (!uid) return
    const [{ data: gs }, { data: ms }] = await Promise.all([
      supabase.from('grupos').select('id, nombre, moneda, invitacion_token, creado_por').order('creado_at'),
      supabase.from('grupo_miembros').select('id, grupo_id').eq('usuario_id', uid),
    ])
    const mio = new Map((ms ?? []).map((m) => [m.grupo_id as string, m.id as string]))
    setGrupos(((gs ?? []) as Grupo[]).map((g) => ({ ...g, miMiembro: mio.get(g.id) ?? '' })))
    setLoading(false)
  }, [session?.user.id])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { grupos, loading, recargar }
}

/** Todo lo de un grupo: miembros, gastos, divisiones, pagos y mis vínculos personales. */
export function useGrupo(id: string | undefined) {
  const { session } = useAuth()
  const [datos, setDatos] = useState<{
    grupo: Grupo | null
    miembros: Miembro[]
    gastos: GastoGrupo[]
    divisiones: Division[]
    pagos: Pago[]
    vinculos: Vinculo[]
    cuentaGrupo: string | null
  }>({ grupo: null, miembros: [], gastos: [], divisiones: [], pagos: [], vinculos: [], cuentaGrupo: null })
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    if (!id) return
    const [g, m, gs, ps, cg] = await Promise.all([
      // Con las columnas de administración; si la base todavía no las tiene, sin ellas.
      supabase
        .from('grupos')
        .select('id, nombre, moneda, invitacion_token, creado_por, admin_id')
        .eq('id', id)
        .maybeSingle()
        .then(async (r) =>
          r.error?.code === '42703'
            ? await supabase.from('grupos').select('id, nombre, moneda, invitacion_token, creado_por').eq('id', id).maybeSingle()
            : r,
        ),
      supabase
        .from('grupo_miembros')
        .select('id, grupo_id, usuario_id, nombre, removido_at, unido_at')
        .eq('grupo_id', id)
        .order('creado_at')
        .then(async (r) =>
          r.error?.code === '42703'
            ? await supabase.from('grupo_miembros').select('id, grupo_id, usuario_id, nombre').eq('grupo_id', id).order('creado_at')
            : r,
        ),
      supabase
        .from('gastos_grupo')
        .select('id, grupo_id, descripcion, fecha, monto, moneda, pagado_por, modo, creado_por')
        .eq('grupo_id', id)
        .order('fecha', { ascending: false })
        .order('creado_at', { ascending: false }),
      supabase
        .from('liquidaciones')
        .select('id, grupo_id, de_miembro, a_miembro, monto, moneda, fecha, creado_por')
        .eq('grupo_id', id)
        .order('fecha', { ascending: false }),
      supabase.from('cuentas').select('id').eq('grupo_id', id).eq('usuario_id', session?.user.id ?? '').maybeSingle(),
    ])
    const gastos = ((gs.data ?? []) as GastoGrupo[]).map(num)
    const pagos = ((ps.data ?? []) as Pago[]).map(num)
    const ids = gastos.map((x) => x.id)
    const [dv, vg, vp] = await Promise.all([
      ids.length
        ? supabase.from('divisiones').select('gasto_id, miembro_id, monto').in('gasto_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from('movimientos').select('id, tipo, monto, gasto_grupo_id, liquidacion_id').in('gasto_grupo_id', ids)
        : Promise.resolve({ data: [] }),
      pagos.length
        ? supabase
            .from('movimientos')
            .select('id, tipo, monto, gasto_grupo_id, liquidacion_id')
            .in('liquidacion_id', pagos.map((p) => p.id))
        : Promise.resolve({ data: [] }),
    ])
    setDatos({
      grupo: (g.data as Grupo) ?? null,
      miembros: (m.data ?? []) as Miembro[],
      gastos,
      divisiones: ((dv.data ?? []) as Division[]).map(num),
      pagos,
      vinculos: [...((vg.data ?? []) as Vinculo[]), ...((vp.data ?? []) as Vinculo[])].map(num),
      cuentaGrupo: (cg.data?.id as string) ?? null,
    })
    setLoading(false)
  }, [id, session?.user.id])

  useEffect(() => {
    recargar()
  }, [recargar])

  const miMiembro = datos.miembros.find((x) => x.usuario_id === session?.user.id && !x.removido_at)?.id ?? null
  // Grupos creados antes de que existiera el admin: lo es quien lo creó.
  const adminId = datos.grupo ? (datos.grupo.admin_id !== undefined ? datos.grupo.admin_id : datos.grupo.creado_por) : null
  const esAdmin = Boolean(session?.user.id && adminId === session.user.id)
  return { ...datos, miMiembro, esAdmin, adminId, loading, recargar }
}

/**
 * Saldo neto de cada miembro, por moneda: lo que pagó − su parte + lo que pagó a
 * otros − lo que recibió. Positivo = le deben; negativo = debe.
 */
export function calcularSaldos(gastos: GastoGrupo[], divisiones: Division[], pagos: Pago[]) {
  const saldos = new Map<Moneda, Map<string, number>>()
  const sumar = (moneda: Moneda, miembro: string, v: number) => {
    if (!saldos.has(moneda)) saldos.set(moneda, new Map())
    const m = saldos.get(moneda)!
    m.set(miembro, (m.get(miembro) ?? 0) + v)
  }
  const monedaDe = new Map(gastos.map((g) => [g.id, g.moneda]))
  for (const g of gastos) sumar(g.moneda, g.pagado_por, g.monto)
  for (const d of divisiones) sumar(monedaDe.get(d.gasto_id) ?? 'ARS', d.miembro_id, -d.monto)
  for (const p of pagos) {
    sumar(p.moneda, p.de_miembro, p.monto)
    sumar(p.moneda, p.a_miembro, -p.monto)
  }
  return saldos
}

export type Deuda = { de: string; a: string; monto: number; moneda: Moneda }

/** Quién le paga a quién, con la menor cantidad de pagos posible. */
export function simplificarDeudas(saldos: Map<Moneda, Map<string, number>>): Deuda[] {
  const out: Deuda[] = []
  for (const [moneda, porMiembro] of saldos) {
    const deudores = [...porMiembro].filter(([, v]) => v < -0.005).map(([m, v]) => ({ m, v: -v }))
    const acreedores = [...porMiembro].filter(([, v]) => v > 0.005).map(([m, v]) => ({ m, v }))
    deudores.sort((a, b) => b.v - a.v)
    acreedores.sort((a, b) => b.v - a.v)
    let i = 0
    let j = 0
    while (i < deudores.length && j < acreedores.length) {
      const monto = Math.min(deudores[i].v, acreedores[j].v)
      out.push({ de: deudores[i].m, a: acreedores[j].m, monto: Math.round(monto * 100) / 100, moneda })
      deudores[i].v -= monto
      acreedores[j].v -= monto
      if (deudores[i].v < 0.005) i++
      if (acreedores[j].v < 0.005) j++
    }
  }
  return out
}

/** Divide un total en partes iguales entre N; los centavos que sobran van a los primeros. */
export function dividirIguales(total: number, n: number): number[] {
  const centavos = Math.round(total * 100)
  const base = Math.floor(centavos / n)
  const resto = centavos - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100)
}

export type Pendiente =
  | { tipo: 'gasto'; gasto: GastoGrupo; miParte: number; pague: boolean }
  | { tipo: 'pago'; pago: Pago; pague: boolean }

/**
 * Lo que todavía no registré en mis finanzas personales: gastos donde tengo parte o
 * que pagué, y pagos entre miembros que me involucran. También detecta si un gasto
 * cambió después de registrarlo.
 */
export function calcularPendientes(
  miMiembro: string | null,
  gastos: GastoGrupo[],
  divisiones: Division[],
  pagos: Pago[],
  vinculos: Vinculo[],
): Pendiente[] {
  if (!miMiembro) return []
  const out: Pendiente[] = []
  for (const g of gastos) {
    const miParte = divisiones.find((d) => d.gasto_id === g.id && d.miembro_id === miMiembro)?.monto ?? 0
    const pague = g.pagado_por === miMiembro
    if (!miParte && !pague) continue
    const mios = vinculos.filter((v) => v.gasto_grupo_id === g.id)
    const parteOk = !miParte || mios.some((v) => v.tipo === 'gasto' && Math.abs(v.monto - miParte) < 0.005)
    const pagoOk = !pague || mios.some((v) => v.tipo === 'transferencia' && Math.abs(v.monto - g.monto) < 0.005)
    if (!parteOk || !pagoOk) out.push({ tipo: 'gasto', gasto: g, miParte, pague })
  }
  for (const p of pagos) {
    if (p.de_miembro !== miMiembro && p.a_miembro !== miMiembro) continue
    if (!vinculos.some((v) => v.liquidacion_id === p.id)) out.push({ tipo: 'pago', pago: p, pague: p.de_miembro === miMiembro })
  }
  return out
}

/**
 * Registra en mis finanzas lo que me toca de un gasto del grupo: mi parte como gasto
 * (desde la cuenta del grupo) y, si pagué, la salida de mi cuenta hacia el grupo.
 * Reemplaza lo registrado antes para ese gasto.
 */
export async function registrarGasto(opts: {
  gasto: GastoGrupo
  miParte: number
  pague: boolean
  cuentaGrupo: string
  categoriaId: string | null
  cuentaPago: string | null
}): Promise<string | null> {
  const { gasto, miParte, pague, cuentaGrupo, categoriaId, cuentaPago } = opts
  if (miParte > 0 && !categoriaId) return 'Elegí la categoría de tu parte.'
  if (pague && !cuentaPago) return 'Elegí con qué cuenta pagaste.'
  const del = await supabase.from('movimientos').delete().eq('gasto_grupo_id', gasto.id)
  if (del.error) return del.error.message
  const filas: Record<string, unknown>[] = []
  if (miParte > 0)
    filas.push({
      tipo: 'gasto',
      monto: miParte,
      moneda: gasto.moneda,
      fecha: gasto.fecha,
      categoria_id: categoriaId,
      cuenta_id: cuentaGrupo,
      nota: gasto.descripcion,
      gasto_grupo_id: gasto.id,
    })
  if (pague)
    filas.push({
      tipo: 'transferencia',
      monto: gasto.monto,
      moneda: gasto.moneda,
      fecha: gasto.fecha,
      cuenta_id: cuentaPago,
      cuenta_destino_id: cuentaGrupo,
      nota: gasto.descripcion,
      gasto_grupo_id: gasto.id,
    })
  if (!filas.length) return null
  const { error } = await supabase.from('movimientos').insert(filas)
  return error?.message ?? null
}

/** Registra en mis finanzas un pago entre miembros: sale de (o entra a) una cuenta mía. */
export async function registrarPago(opts: {
  pago: Pago
  pague: boolean
  cuentaGrupo: string
  cuenta: string | null
  nota: string
}): Promise<string | null> {
  const { pago, pague, cuentaGrupo, cuenta, nota } = opts
  if (!cuenta) return pague ? 'Elegí de qué cuenta pagaste.' : 'Elegí a qué cuenta entró la plata.'
  const { error } = await supabase.from('movimientos').insert({
    tipo: 'transferencia',
    monto: pago.monto,
    moneda: pago.moneda,
    fecha: pago.fecha,
    cuenta_id: pague ? cuenta : cuentaGrupo,
    cuenta_destino_id: pague ? cuentaGrupo : cuenta,
    nota,
    liquidacion_id: pago.id,
  })
  return error?.message ?? null
}

export const linkInvitacion = (token: string) => `${window.location.origin}/unirse/${token}`
