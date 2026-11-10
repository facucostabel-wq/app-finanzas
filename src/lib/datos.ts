import { useCallback, useEffect, useState } from 'react'
import { rangoMes, type Mes, type Moneda } from './format'
import { supabase } from './supabase'

export type TipoCategoria = 'gasto' | 'ingreso' | 'inversion'
export type TipoMovimiento = 'gasto' | 'ingreso' | 'aporte' | 'rescate' | 'transferencia'
export type FormaPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'billetera'

export type Categoria = {
  id: string
  tipo: TipoCategoria
  nombre: string
  orden: number
  activa: boolean
  /** "Moneda extranjera": cada subcategoría es una moneda y la cantidad son las divisas compradas. */
  es_divisas: boolean
  /** Ícono elegido (clave de ICONOS); null = automático según el nombre. */
  icono: string | null
}

export type Movimiento = {
  id: string
  fecha: string
  tipo: TipoMovimiento
  monto: number
  moneda: Moneda
  /** null solo en transferencias. */
  categoria_id: string | null
  /** Dato histórico (antes de las cuentas). Ya no se carga. */
  forma_pago: FormaPago | null
  /** Cuenta de la que sale o a la que entra la plata (origen, en transferencias). */
  cuenta_id: string
  /** Solo transferencias: cuenta que recibe. */
  cuenta_destino_id: string | null
  /** Si es una cuota: la compra en cuotas a la que pertenece y su número. */
  compra_id: string | null
  cuota_n: number | null
  nota: string | null
  /** Subcategoría de inversión (BTC, AAPL…). Solo inversiones. */
  activo_id: string | null
  /** Unidades compradas o vendidas. Solo inversiones. */
  cantidad: number | null
}

export type TipoCuenta = 'banco' | 'billetera' | 'efectivo' | 'tarjeta' | 'broker' | 'grupo'

export type Cuenta = {
  id: string
  nombre: string
  tipo: TipoCuenta
  orden: number
  activa: boolean
  /** Solo tarjetas: la cuenta a la que pertenecen (ej. "Visa Galicia" → "Galicia"). */
  cuenta_padre_id: string | null
  /** Solo cuentas de grupo (las crea la app): lo que te deben o debés en ese grupo. */
  grupo_id: string | null
}

/** Nombre para mostrar: a las cuentas de grupo se les quita el sufijo interno. */
export const nombreCuenta = (c: Pick<Cuenta, 'nombre' | 'tipo'>) =>
  c.tipo === 'grupo' ? c.nombre.replace(/ [0-9a-f]{4}$/, '') : c.nombre

export const TIPOS_CUENTA: { valor: TipoCuenta; texto: string }[] = [
  { valor: 'banco', texto: 'Banco' },
  { valor: 'billetera', texto: 'Billetera virtual' },
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'tarjeta', texto: 'Tarjeta de crédito' },
  { valor: 'broker', texto: 'Broker / exchange' },
]

export const TEXTO_TIPO_CUENTA = {
  ...Object.fromEntries(TIPOS_CUENTA.map((t) => [t.valor, t.texto])),
  grupo: 'Grupo',
} as Record<TipoCuenta, string>

/** Cuentas cuyo saldo es "disponible para gastar" (no tarjetas ni brokers). */
export const esCuentaDisponible = (tipo: TipoCuenta) => tipo === 'banco' || tipo === 'billetera' || tipo === 'efectivo'

export function useCuentas() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const recargar = useCallback(async () => {
    const campos = 'id, nombre, tipo, orden, activa, cuenta_padre_id'
    let { data, error }: { data: unknown[] | null; error: { code?: string; message: string } | null } = await supabase
      .from('cuentas')
      .select(`${campos}, grupo_id`)
      .order('orden')
      .order('nombre')
    // Si la base todavía no tiene la migración de grupos, leemos sin esa columna
    // para que las cuentas no desaparezcan.
    if (error?.code === '42703') {
      ;({ data, error } = await supabase.from('cuentas').select(campos).order('orden').order('nombre'))
    }
    if (error) setError(error.message)
    else setError(null)
    setCuentas(((data ?? []) as Partial<Cuenta>[]).map((c) => ({ grupo_id: null, ...c }) as Cuenta))
    setLoading(false)
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { cuentas, loading, error, recargar }
}

/** Subcategoría de inversión: BTC dentro de Cripto, AAPL dentro de CEDEARs… */
export type Activo = {
  id: string
  categoria_id: string
  nombre: string
  activa: boolean
  /** Solo en "Moneda extranjera": la moneda que representa (USD, EUR…). */
  divisa: string | null
}

const CAMPOS_MOV =
  'id, fecha, tipo, monto, moneda, categoria_id, forma_pago, nota, activo_id, cantidad, cuenta_id, cuenta_destino_id, compra_id, cuota_n'

// numeric llega como string desde la API: lo pasamos a número.
function normalizar(m: Record<string, unknown>): Movimiento {
  return { ...(m as Movimiento), monto: Number(m.monto), cantidad: m.cantidad == null ? null : Number(m.cantidad) }
}

export type NuevoMovimiento = Omit<Movimiento, 'id'>

/** Texto para mostrar cada tipo en listas. */
export const TEXTO_TIPO: Record<TipoMovimiento, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  aporte: 'Invertí',
  rescate: 'Retiré de inversión',
  transferencia: 'Transferencia',
}

export const FORMAS_PAGO: { valor: FormaPago; texto: string }[] = [
  { valor: 'debito', texto: 'Débito' },
  { valor: 'credito', texto: 'Crédito' },
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'billetera', texto: 'Billetera virtual' },
]

export const TEXTO_FORMA_PAGO = Object.fromEntries(FORMAS_PAGO.map((f) => [f.valor, f.texto])) as Record<
  FormaPago,
  string
>

/** Qué tipo de categoría usa cada tipo de movimiento. */
export function tipoCategoriaDe(tipo: Exclude<TipoMovimiento, 'transferencia'>): TipoCategoria {
  return tipo === 'aporte' || tipo === 'rescate' ? 'inversion' : tipo
}

// RLS garantiza que todas estas consultas devuelven solo datos del usuario logueado.

export function useCategorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    const campos = 'id, tipo, nombre, orden, activa, es_divisas'
    let { data, error }: { data: unknown[] | null; error: { code?: string; message: string } | null } = await supabase
      .from('categorias')
      .select(`${campos}, icono`)
      .order('orden')
      .order('nombre')
    // Base sin la columna de íconos todavía: se leen igual, con ícono automático.
    if (error?.code === '42703') {
      ;({ data, error } = await supabase.from('categorias').select(campos).order('orden').order('nombre'))
    }
    if (error) setError(error.message)
    else setCategorias(((data ?? []) as Partial<Categoria>[]).map((c) => ({ icono: null, ...c }) as Categoria))
    setLoading(false)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { categorias, loading, error, recargar }
}

export function useMovimientosDelMes(mes: Mes) {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setLoading(true)
    const { desde, hasta } = rangoMes(mes)
    const { data, error } = await supabase
      .from('movimientos')
      .select(CAMPOS_MOV)
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .order('fecha', { ascending: false })
      .order('creado_at', { ascending: false })
    if (error) setError(error.message)
    else {
      setError(null)
      setMovimientos((data ?? []).map(normalizar))
    }
    setLoading(false)
  }, [mes])

  useEffect(() => {
    recargar()
  }, [recargar])

  return { movimientos, loading, error, recargar }
}

export async function obtenerMovimiento(id: string): Promise<Movimiento | null> {
  const { data } = await supabase.from('movimientos').select(CAMPOS_MOV).eq('id', id).maybeSingle()
  return data ? normalizar(data) : null
}

export type Totales = {
  ingresos: number
  gastos: number
  /** Parte de los gastos hecha con tarjeta de crédito. */
  gastosCredito: number
  aportes: number
  rescates: number
  pagosTarjeta: number
  /** Plata de esta moneda usada para comprar moneda extranjera (neto de ventas). */
  usadoEnDivisas: number
}

const totalesVacios = (): Totales => ({
  ingresos: 0,
  gastos: 0,
  gastosCredito: 0,
  aportes: 0,
  rescates: 0,
  pagosTarjeta: 0,
  usadoEnDivisas: 0,
})

/**
 * Totales del mes por moneda (sin convertir: cada moneda por separado).
 * Las compras/ventas de moneda extranjera cuentan en esa moneda, por la cantidad
 * comprada o vendida, no por lo que se pagó en pesos.
 */
export function totalesPorMoneda(
  movs: Movimiento[],
  activos: Activo[] = [],
  cuentas: Cuenta[] = [],
): Map<Moneda, Totales> {
  const divisaDe = new Map(activos.map((a) => [a.id, a.divisa]))
  const tipoCuenta = new Map(cuentas.map((c) => [c.id, c.tipo]))
  const t = new Map<Moneda, Totales>()
  const de = (moneda: Moneda) => {
    if (!t.has(moneda)) t.set(moneda, totalesVacios())
    return t.get(moneda)!
  }
  for (const m of movs) {
    const divisa = m.activo_id ? divisaDe.get(m.activo_id) : null
    if (divisa && m.cantidad) {
      // Compra/venta de moneda extranjera: cuenta en esa moneda por la cantidad…
      const signo = m.tipo === 'aporte' ? 1 : -1
      if (m.tipo === 'aporte') de(divisa).aportes += m.cantidad
      else de(divisa).rescates += m.cantidad
      // …y se registra cuánto de la moneda de pago se usó.
      de(m.moneda).usadoEnDivisas += signo * m.monto
      continue
    }
    const x = de(m.moneda)
    if (m.tipo === 'gasto') {
      x.gastos += m.monto
      if (tipoCuenta.get(m.cuenta_id) === 'tarjeta') x.gastosCredito += m.monto
    } else if (m.tipo === 'ingreso') x.ingresos += m.monto
    else if (m.tipo === 'aporte') x.aportes += m.monto
    else if (m.tipo === 'rescate') x.rescates += m.monto
    else if (m.tipo === 'transferencia' && m.cuenta_destino_id && tipoCuenta.get(m.cuenta_destino_id) === 'tarjeta')
      x.pagosTarjeta += m.monto
  }
  return t
}

/** Ordena monedas: primero las favoritas (en su orden), después el resto alfabéticamente. */
export function ordenarMonedas(monedas: Iterable<Moneda>, favoritas: Moneda[]): Moneda[] {
  const pos = (m: Moneda) => {
    const i = favoritas.indexOf(m)
    return i === -1 ? 999 : i
  }
  return [...monedas].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
}

/** Gastos agrupados por categoría, de mayor a menor. */
export function gastosPorCategoria(movs: Movimiento[], moneda: Moneda, categorias: Categoria[]) {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const acc = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo !== 'gasto' || m.moneda !== moneda || !m.categoria_id) continue
    acc.set(m.categoria_id, (acc.get(m.categoria_id) ?? 0) + m.monto)
  }
  return [...acc.entries()]
    .map(([id, total]) => ({ id, nombre: porId.get(id)?.nombre ?? '—', icono: porId.get(id)?.icono ?? null, total }))
    .sort((a, b) => b.total - a.total)
}

export function useActivos() {
  const [activos, setActivos] = useState<Activo[]>([])
  const recargar = useCallback(async () => {
    const { data } = await supabase.from('activos').select('id, categoria_id, nombre, activa, divisa').order('nombre')
    setActivos((data ?? []) as Activo[])
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { activos, recargar }
}

/** Todas las inversiones (aportes y rescates) históricas, en orden cronológico. */
export function useInversiones() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase
      .from('movimientos')
      .select(CAMPOS_MOV)
      .in('tipo', ['aporte', 'rescate'])
      .order('fecha')
      .order('creado_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMovimientos((data ?? []).map(normalizar))
        setLoading(false)
      })
  }, [])
  return { movimientos, loading, error }
}

export type SaldoInicial = { cuenta_id: string; moneda: Moneda; monto: number }

/** Saldos iniciales por cuenta y moneda (lo que había al empezar a usar la app). */
export function useSaldosIniciales() {
  const [saldos, setSaldos] = useState<SaldoInicial[]>([])
  const [loading, setLoading] = useState(true)
  const recargar = useCallback(async () => {
    const { data } = await supabase.from('saldos_iniciales').select('cuenta_id, moneda, monto')
    setSaldos((data ?? []).map((r) => ({ cuenta_id: r.cuenta_id, moneda: r.moneda, monto: Number(r.monto) })))
    setLoading(false)
  }, [])
  useEffect(() => {
    recargar()
  }, [recargar])
  return { saldos, loading, recargar }
}

/** Saldo de cada cuenta, por moneda, al cierre del mes (o hoy, si es el mes actual). */
export function useSaldosCuentas(mes: Mes) {
  const [saldos, setSaldos] = useState<SaldoInicial[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const { hasta } = rangoMes(mes)
    supabase.rpc('saldos_al', { hasta }).then(({ data, error }) => {
      if (error) setError(error.message)
      else {
        setError(null)
        setSaldos(
          ((data ?? []) as { cuenta_id: string; moneda: string; monto: number }[]).map((r) => ({
            cuenta_id: r.cuenta_id,
            moneda: r.moneda,
            monto: Number(r.monto),
          })),
        )
      }
    })
  }, [mes])
  return { saldos, error }
}

/** Compra en cuotas con tarjeta: se carga una vez y la base genera un gasto por mes. */
export type CompraCuotas = {
  id: string
  fecha: string
  monto_total: number
  moneda: Moneda
  cuotas: number
  cuenta_id: string
  categoria_id: string
  nota: string | null
}

export async function obtenerCompra(id: string): Promise<CompraCuotas | null> {
  const { data } = await supabase
    .from('compras_cuotas')
    .select('id, fecha, monto_total, moneda, cuotas, cuenta_id, categoria_id, nota')
    .eq('id', id)
    .maybeSingle()
  return data ? ({ ...data, monto_total: Number(data.monto_total) } as CompraCuotas) : null
}

/** Cuotas que todavía no vencieron (fecha desde `desde`), sumadas por tarjeta y moneda. */
export function useCuotasFuturas(desde: string) {
  const [futuras, setFuturas] = useState<{ cuenta_id: string; moneda: Moneda; monto: number }[]>([])
  useEffect(() => {
    supabase
      .from('movimientos')
      .select('cuenta_id, moneda, monto')
      .not('compra_id', 'is', null)
      .gte('fecha', desde)
      .then(({ data }) => {
        const acc = new Map<string, { cuenta_id: string; moneda: Moneda; monto: number }>()
        for (const r of data ?? []) {
          const k = `${r.cuenta_id}|${r.moneda}`
          const x = acc.get(k) ?? { cuenta_id: r.cuenta_id as string, moneda: r.moneda as string, monto: 0 }
          x.monto += Number(r.monto)
          acc.set(k, x)
        }
        setFuturas([...acc.values()])
      })
  }, [desde])
  return futuras
}
