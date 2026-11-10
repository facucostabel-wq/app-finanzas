import { useCierres, useTiposHoy } from './cotizaciones'
import { useActivos, useCuentas, useInversiones, useSaldosCuentas } from './datos'
import { mesActual } from './format'
import { useObjetivos, type Contexto } from './objetivos'
import { calcularTenencias } from './tenencias'

/** Objetivos + todo lo necesario para valuarlos hoy. */
export function useObjetivosConContexto() {
  const datos = useObjetivos()
  const { cuentas } = useCuentas()
  const { saldos } = useSaldosCuentas(mesActual())
  const { activos } = useActivos()
  const { movimientos: inversiones } = useInversiones()
  const { cierres, recargar: recargarCierres } = useCierres()
  const tenencias = calcularTenencias(inversiones)
  const monedas = [
    ...datos.objetivos.map((o) => o.moneda),
    ...datos.aportes.map((a) => a.moneda),
    ...saldos.map((s) => s.moneda),
    ...tenencias.map((t) => t.moneda),
    ...activos.filter((a) => a.divisa).map((a) => a.divisa!),
  ]
  const tipos = useTiposHoy(monedas, cierres[0]?.tipos)
  const ctx: Contexto = { cuentas, saldos, activos, tenencias, tipos, ultimoCierre: cierres[0] }
  return { ...datos, ctx, cierres, recargarCierres }
}
