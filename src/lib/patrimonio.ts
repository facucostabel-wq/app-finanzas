import { useEffect, useState } from 'react'
import { convertir, useCierres, useTiposHoy, type Cierre, type Tipos } from './cotizaciones'
import { useActivos, useCuentas, useInversiones, type Activo, type Cuenta, type Movimiento } from './datos'
import { hoyISO, moverMes, type Moneda } from './format'
import { supabase } from './supabase'
import { calcularTenencias } from './tenencias'
import { useCartera } from './useCartera'

export type Partes = {
  /** Bancos, billeteras y efectivo. */
  disponible: number
  /** Plata sin invertir en brokers. */
  broker: number
  inversiones: number
  /** Saldo de tarjetas (negativo = deuda). */
  tarjetas: number
  /** Lo que te deben en grupos y préstamos (positivo) o lo que debés (negativo). */
  deudas: number
}
export type Punto = { mes: string; esHoy: boolean; total: number; partes: Partes; sinConvertir: boolean }

type Saldo = { cuenta_id: string; moneda: Moneda; monto: number }

async function saldosAl(hasta: string): Promise<Saldo[]> {
  const { data } = await supabase.rpc('saldos_al', { hasta })
  return ((data ?? []) as Saldo[]).map((s) => ({ ...s, monto: Number(s.monto) }))
}

/** Cuentas en USD, separadas por tipo. */
function partesCuentas(saldos: Saldo[], cuentas: Cuenta[], tipos: Tipos) {
  const tipo = new Map(cuentas.map((c) => [c.id, c.tipo]))
  const p: Partes = { disponible: 0, broker: 0, inversiones: 0, tarjetas: 0, deudas: 0 }
  let sinConvertir = false
  for (const s of saldos) {
    const v = convertir(s.monto, s.moneda, 'USD', tipos)
    if (v === null) {
      if (Math.abs(s.monto) > 0.005) sinConvertir = true
      continue
    }
    const t = tipo.get(s.cuenta_id)
    if (t === 'tarjeta') p.tarjetas += v
    else if (t === 'broker') p.broker += v
    else if (t === 'grupo' || t === 'persona') p.deudas += v
    else p.disponible += v
  }
  return { p, sinConvertir }
}

/** Inversiones al cierre: divisas a su cotización, el resto al precio del cierre o al costo. */
function inversionesAlCierre(movs: Movimiento[], activos: Activo[], c: Cierre) {
  const divisa = new Map(activos.map((a) => [a.id, a.divisa]))
  let total = 0
  for (const t of calcularTenencias(movs).filter((x) => x.cantidad > 0)) {
    const d = t.activo_id ? divisa.get(t.activo_id) : null
    const precio = c.precios.get(t.activo_id ?? `cat:${t.categoria_id}`)
    const v = d
      ? convertir(t.cantidad, d, 'USD', c.tipos)
      : precio
        ? convertir(t.cantidad * precio.precio, precio.moneda, 'USD', c.tipos)
        : convertir(t.costo, t.moneda, 'USD', c.tipos)
    total += v ?? 0
  }
  return total
}

const total = (p: Partes) => p.disponible + p.broker + p.inversiones + p.tarjetas + p.deudas

/**
 * Patrimonio en USD mes a mes: un punto por cada cierre guardado (con sus cotizaciones y
 * precios) más el de hoy (con el valor actual de la cartera).
 */
export function usePatrimonio() {
  const { cierres, loading: cargandoCierres } = useCierres()
  const { cuentas } = useCuentas()
  const { activos } = useActivos()
  const { movimientos: inversiones, loading: cargandoInv } = useInversiones()
  const cartera = useCartera()
  const tiposHoy = useTiposHoy(['USD'], cierres[0]?.tipos)
  const [historico, setHistorico] = useState<Punto[] | null>(null)
  const [saldosHoy, setSaldosHoy] = useState<Saldo[] | null>(null)

  const claveCierres = cierres.map((c) => c.id).join(',')
  useEffect(() => {
    if (cargandoCierres || cargandoInv || !cuentas.length) return
    let vigente = true
    const ultimos = [...cierres].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-24)
    Promise.all(
      ultimos.map(async (c) => {
        const mes = c.mes.slice(0, 7)
        const hasta = `${moverMes(mes, 1)}-01`
        const { p, sinConvertir } = partesCuentas(await saldosAl(hasta), cuentas, c.tipos)
        p.inversiones = inversionesAlCierre(
          inversiones.filter((m) => m.fecha < hasta),
          activos,
          c,
        )
        return { mes, esHoy: false, total: total(p), partes: p, sinConvertir }
      }),
    ).then((pts) => vigente && setHistorico(pts))
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveCierres, cargandoCierres, cargandoInv, cuentas.length, activos.length, inversiones.length])

  useEffect(() => {
    const manana = new Date(`${hoyISO()}T12:00:00`)
    manana.setDate(manana.getDate() + 1)
    saldosAl(manana.toISOString().slice(0, 10)).then(setSaldosHoy)
  }, [])

  let hoy: Punto | null = null
  if (saldosHoy && tiposHoy.get('USD') && !cartera.loading) {
    const { p, sinConvertir } = partesCuentas(saldosHoy, cuentas, tiposHoy)
    p.inversiones = cartera.totales.valorUsd
    hoy = { mes: hoyISO().slice(0, 7), esHoy: true, total: total(p), partes: p, sinConvertir }
  }
  const puntos = [...(historico ?? []), ...(hoy ? [hoy] : [])]
  return { puntos, hoy, loading: historico === null || !hoy, hayCierres: cierres.length > 0 }
}
