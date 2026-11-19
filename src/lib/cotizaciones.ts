import { useEffect, useState } from 'react'
import type { Mes, Moneda } from './format'
import { supabase } from './supabase'

/** Pesos por unidad de cada moneda (ARS = 1). USD es el dólar MEP. */
export type Tipos = Map<Moneda, number>

export function convertir(monto: number, de: Moneda, a: Moneda, tipos: Tipos): number | null {
  if (de === a) return monto
  const arsDe = de === 'ARS' ? 1 : tipos.get(de)
  const arsA = a === 'ARS' ? 1 : tipos.get(a)
  if (!arsDe || !arsA) return null
  return (monto * arsDe) / arsA
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() as Promise<T>
}

const ultimoDiaDe = (mes: Mes) => {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Dólar MEP: el de hoy si `mes` es el actual (o no se indica), si no el del último día
 * hábil de ese mes. Fuentes públicas: DolarAPI (hoy) y ArgentinaDatos (histórico).
 */
export async function traerMep(mes?: Mes, esActual = true): Promise<number | null> {
  try {
    if (!mes || esActual) {
      const d = await json<{ venta: number }>('https://dolarapi.com/v1/dolares/bolsa')
      return d.venta || null
    }
    const fin = ultimoDiaDe(mes)
    for (let i = 0; i < 6; i++) {
      const d = new Date(fin.getTime() - i * 86400000)
      const [y, m, dd] = iso(d).split('-')
      try {
        const r = await json<{ venta: number }>(`https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/${y}/${m}/${dd}`)
        if (r?.venta) return r.venta
      } catch {
        /* fin de semana o feriado: probar el día anterior */
      }
    }
  } catch {
    /* sin conexión o fuente caída */
  }
  return null
}

/** Unidades de cada moneda por 1 USD (Banco Central Europeo, vía Frankfurter). */
async function traerContraDolar(monedas: Moneda[], fecha?: string): Promise<Map<Moneda, number>> {
  const otras = monedas.filter((m) => m !== 'USD' && m !== 'ARS')
  const res = new Map<Moneda, number>()
  if (!otras.length) return res
  try {
    const r = await json<{ rates: Record<string, number> }>(
      `https://api.frankfurter.dev/v1/${fecha ?? 'latest'}?base=USD&symbols=${otras.join(',')}`,
    )
    for (const [m, v] of Object.entries(r.rates ?? {})) res.set(m, v)
  } catch {
    /* sin datos: quedan para cargar a mano */
  }
  return res
}

/** Pesos por unidad de cada moneda pedida, lo que se pueda traer automáticamente. */
export async function traerTipos(monedas: Moneda[], mes?: Mes, esActual = true): Promise<Tipos> {
  const tipos: Tipos = new Map()
  const mep = await traerMep(mes, esActual)
  if (!mep) return tipos
  tipos.set('USD', mep)
  const fecha = mes && !esActual ? iso(ultimoDiaDe(mes)) : undefined
  const porDolar = await traerContraDolar(monedas, fecha)
  for (const [m, unidadesPorUsd] of porDolar) if (unidadesPorUsd > 0) tipos.set(m, mep / unidadesPorUsd)
  return tipos
}

// Cripto conocidas: precio en USD vía CoinGecko.
const CRIPTO: [RegExp, string][] = [
  [/\b(btc|bitcoin)\b/i, 'bitcoin'],
  [/\b(eth|ethereum|ether)\b/i, 'ethereum'],
  [/\b(usdt|tether)\b/i, 'tether'],
  [/\b(usdc)\b/i, 'usd-coin'],
  [/\b(sol|solana)\b/i, 'solana'],
  [/\b(bnb)\b/i, 'binancecoin'],
  [/\b(ada|cardano)\b/i, 'cardano'],
  [/\b(xrp|ripple)\b/i, 'ripple'],
  [/\b(dai)\b/i, 'dai'],
  [/\b(nexo)\b/i, 'nexo'],
]
export const idCripto = (nombre: string) => CRIPTO.find(([re]) => re.test(nombre))?.[1] ?? null

/** Precio en USD de cada cripto (por id de CoinGecko). Solo precio actual. */
export async function traerCripto(ids: string[]): Promise<Map<string, number>> {
  const res = new Map<string, number>()
  if (!ids.length) return res
  try {
    const r = await json<Record<string, { usd: number }>>(
      `https://api.coingecko.com/api/v3/simple/price?ids=${[...new Set(ids)].join(',')}&vs_currencies=usd`,
    )
    for (const [id, v] of Object.entries(r)) if (v?.usd) res.set(id, v.usd)
  } catch {
    /* quedan para cargar a mano */
  }
  return res
}

export type Cierre = {
  id: string
  mes: string // YYYY-MM-01
  cerrado_at: string
  tipos: Tipos
  precios: Map<string, { precio: number; moneda: Moneda }>
  objetivos: Map<string, number>
}

/** Todos los cierres del usuario, del más nuevo al más viejo. */
export function useCierres() {
  const [cierres, setCierres] = useState<Cierre[]>([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  useEffect(() => {
    ;(async () => {
      const { data: cs, error } = await supabase.from('cierres').select('id, mes, cerrado_at').order('mes', { ascending: false })
      if (error || !cs?.length) {
        setCierres([])
        setLoading(false)
        return
      }
      const ids = cs.map((c) => c.id)
      const [t, p, o] = await Promise.all([
        supabase.from('cierre_tipos').select('cierre_id, moneda, ars').in('cierre_id', ids),
        supabase.from('cierre_precios').select('cierre_id, clave, precio, moneda').in('cierre_id', ids),
        supabase.from('cierre_objetivos').select('cierre_id, objetivo_id, progreso').in('cierre_id', ids),
      ])
      setCierres(
        cs.map((c) => ({
          id: c.id,
          mes: c.mes,
          cerrado_at: c.cerrado_at,
          tipos: new Map((t.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.moneda, Number(x.ars)])),
          precios: new Map(
            (p.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.clave, { precio: Number(x.precio), moneda: x.moneda }]),
          ),
          objetivos: new Map((o.data ?? []).filter((x) => x.cierre_id === c.id).map((x) => [x.objetivo_id, Number(x.progreso)])),
        })),
      )
      setLoading(false)
    })()
  }, [version])
  return { cierres, loading, recargar: () => setVersion((v) => v + 1) }
}

const CLAVE_CACHE = 'tipos_hoy'

/**
 * Tipos de cambio para mostrar valores "de hoy": se traen una vez cada 6 horas y,
 * si no hay conexión con las fuentes, se usan los del último cierre.
 */
export function useTiposHoy(monedas: Moneda[], respaldo?: Tipos) {
  const [tipos, setTipos] = useState<Tipos>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) ?? 'null') as { t: number; v: [string, number][] } | null
      if (c && Date.now() - c.t < 6 * 3600000) return new Map(c.v)
    } catch {
      /* nada */
    }
    return new Map()
  })
  const clave = [...new Set(monedas)].sort().join(',')
  useEffect(() => {
    const faltan = clave.split(',').filter((m) => m && m !== 'ARS' && !tipos.has(m))
    if (!faltan.length && tipos.has('USD')) return
    traerTipos([...new Set([...faltan, ...tipos.keys()])]).then((t) => {
      if (!t.size) return
      setTipos(t)
      try {
        localStorage.setItem(CLAVE_CACHE, JSON.stringify({ t: Date.now(), v: [...t] }))
      } catch {
        /* nada */
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  // Lo que no se pudo traer, del último cierre.
  const combinados: Tipos = new Map(respaldo ?? [])
  for (const [m, v] of tipos) combinados.set(m, v)
  return combinados
}

const CLAVE_HIST = 'mep_historico'

/**
 * Dólar MEP de cualquier fecha (serie diaria de ArgentinaDatos), para pasar a dólares
 * cada compra con el dólar de ese día. Se guarda en el dispositivo y se renueva una vez por día.
 * Devuelve null mientras no se tiene la serie.
 */
export function useMepHistorico() {
  const [serie, setSerie] = useState<[string, number][] | null>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_HIST) ?? 'null') as { t: number; v: [string, number][] } | null
      return c?.v?.length ? c.v : null
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_HIST) ?? 'null') as { t: number } | null
      if (c && Date.now() - c.t < 20 * 3600000) return
    } catch {
      /* nada */
    }
    json<{ fecha: string; venta: number }[]>('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa')
      .then((datos) => {
        const v = datos
          .filter((d) => d.fecha && d.venta > 0)
          .map((d) => [d.fecha.slice(0, 10), d.venta] as [string, number])
          .sort((a, b) => a[0].localeCompare(b[0]))
        if (!v.length) return
        setSerie(v)
        try {
          localStorage.setItem(CLAVE_HIST, JSON.stringify({ t: Date.now(), v }))
        } catch {
          /* sin lugar: se usa en memoria */
        }
      })
      .catch(() => {
        /* sin conexión: se usa el dólar de hoy como aproximación */
      })
  }, [])

  if (!serie) return null
  /** Último MEP publicado hasta esa fecha (fines de semana y feriados usan el anterior). */
  return (fecha: string): number | null => {
    let lo = 0
    let hi = serie.length - 1
    if (fecha < serie[0][0]) return null
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (serie[mid][0] <= fecha) lo = mid
      else hi = mid - 1
    }
    return serie[lo][1]
  }
}

const CLAVE_CRIPTO = 'precios_cripto'

/** Precio actual en USD de las cripto conocidas (se renueva cada 15 minutos). */
export function usePreciosCripto(ids: string[]) {
  const [precios, setPrecios] = useState<Map<string, number>>(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CRIPTO) ?? 'null') as { t: number; v: [string, number][] } | null
      return new Map(c?.v ?? [])
    } catch {
      return new Map()
    }
  })
  const [actualizado, setActualizado] = useState<number | null>(null)
  const clave = [...new Set(ids)].sort().join(',')
  const traer = (forzar = false) => {
    if (!clave) return
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CRIPTO) ?? 'null') as { t: number; v: [string, number][] } | null
      const faltan = clave.split(',').some((id) => !c?.v?.some(([k]) => k === id))
      if (!forzar && c && !faltan && Date.now() - c.t < 15 * 60000) {
        setActualizado(c.t)
        return
      }
    } catch {
      /* nada */
    }
    traerCripto(clave.split(',')).then((p) => {
      if (!p.size) return
      setPrecios(p)
      const t = Date.now()
      setActualizado(t)
      try {
        localStorage.setItem(CLAVE_CRIPTO, JSON.stringify({ t, v: [...p] }))
      } catch {
        /* nada */
      }
    })
  }
  useEffect(() => {
    traer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return { precios, actualizado, refrescar: () => traer(true) }
}
