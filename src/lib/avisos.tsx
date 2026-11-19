import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { nombreCuenta, TEXTO_TIPO_CUENTA, useSaldosAl, type Cuenta, type SaldoInicial } from './datos'
import { formatMonto, type Moneda } from './format'
import { nombreCortoMoneda } from './monedas'
import type { Opcion } from '../components/Combobox'

/** Aviso que no frena: un ⚠ y una línea en ámbar. Se puede guardar igual. */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="aviso-suave" role="status">
      <TriangleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

/** Cuentas que no tienen "saldo" propio: no se avisa por fondos. */
const SIN_SALDO = ['tarjeta', 'grupo']

/** Efecto de un movimiento en una cuenta (para descontarlo al editar). */
export type Efecto = { cuenta_id: string | null; moneda: Moneda; monto: number }

export function efectosDe(m: {
  tipo: string
  monto: number
  moneda: Moneda
  cuenta_id: string | null
  cuenta_destino_id?: string | null
}): Efecto[] {
  const signo = m.tipo === 'ingreso' || m.tipo === 'rescate' ? 1 : -1
  const efectos: Efecto[] = [{ cuenta_id: m.cuenta_id, moneda: m.moneda, monto: signo * m.monto }]
  if (m.tipo === 'transferencia') efectos.push({ cuenta_id: m.cuenta_destino_id ?? null, moneda: m.moneda, monto: m.monto })
  return efectos
}

/** Saldo de una cuenta en una moneda, sin contar lo que ya estaba guardado de este mismo movimiento. */
export function saldoDe(saldos: SaldoInicial[], cuentaId: string, moneda: Moneda, descontar: Efecto[] = []) {
  const base = saldos.find((s) => s.cuenta_id === cuentaId && s.moneda === moneda)?.monto ?? 0
  return descontar.filter((e) => e.cuenta_id === cuentaId && e.moneda === moneda).reduce((t, e) => t - e.monto, base)
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** "Galicia tiene $ 12.000; quedaría en −$ 8.000" o null si alcanza. */
export function avisoFondos(opts: {
  cuenta: Cuenta | undefined
  moneda: Moneda
  monto: number | null
  saldos: SaldoInicial[] | null
  descontar?: Efecto[]
  verbo?: string
}): string | null {
  const { cuenta, moneda, monto, saldos, descontar = [], verbo = 'con este gasto' } = opts
  if (!cuenta || !saldos || !monto || monto <= 0 || SIN_SALDO.includes(cuenta.tipo)) return null
  const saldo = r2(saldoDe(saldos, cuenta.id, moneda, descontar))
  if (monto <= saldo + 0.005) return null
  const nombre = nombreCuenta(cuenta)
  const otras = saldos.filter((s) => s.cuenta_id === cuenta.id && s.moneda !== moneda && s.monto > 0.005)
  if (Math.abs(saldo) < 0.005 && otras.length)
    return `${nombre} no tiene ${nombreCortoMoneda(moneda).toLowerCase()} (tiene ${otras.map((o) => formatMonto(r2(o.monto), o.moneda)).join(' y ')}).`
  if (saldo <= 0.005) return `${nombre} no tiene fondos en ${nombreCortoMoneda(moneda).toLowerCase()} (saldo ${formatMonto(saldo, moneda)}).`
  return `${nombre} tiene ${formatMonto(saldo, moneda)}; ${verbo} quedaría en ${formatMonto(r2(saldo - monto), moneda)}.`
}

/** Opciones de cuenta de origen con su saldo en la moneda elegida; las sin fondos, apagadas. */
export function opcionesConSaldo(cuentas: Cuenta[], moneda: Moneda, saldos: SaldoInicial[] | null, descontar: Efecto[] = []): Opcion[] {
  return cuentas.map((c) => {
    if (!saldos || SIN_SALDO.includes(c.tipo)) return { valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] }
    const saldo = r2(saldoDe(saldos, c.id, moneda, descontar))
    return { valor: c.id, texto: nombreCuenta(c), detalle: formatMonto(saldo, moneda), apagada: saldo <= 0.005 }
  })
}

const hoy = () => new Date().toISOString().slice(0, 10)

/** Fecha en el futuro. */
export function avisoFecha(fecha: string): string | null {
  if (!fecha || fecha <= hoy()) return null
  const f = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', year: 'numeric' })
  return `La fecha es del ${f}, en el futuro.`
}

/** Aviso de fondos listo para usar en un formulario (trae los saldos a la fecha). */
export function AvisoFondosCuenta(props: {
  cuentas: Cuenta[]
  cuentaId: string | null
  moneda: Moneda
  monto: number | null
  fecha: string
  verbo?: string
}) {
  const saldos = useSaldosAl(props.fecha)
  const texto = avisoFondos({
    cuenta: props.cuentas.find((c) => c.id === props.cuentaId),
    moneda: props.moneda,
    monto: props.monto,
    saldos,
    verbo: props.verbo,
  })
  return texto ? <Aviso>{texto}</Aviso> : null
}
