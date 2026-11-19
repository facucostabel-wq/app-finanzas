import { armarCartera, totalesCartera, useValuaciones } from './cartera'
import { useCierres, useMepHistorico, useTiposHoy } from './cotizaciones'
import { useActivos, useCategorias, useInversiones } from './datos'

/** Cartera completa: posiciones valuadas en dólares y totales. */
export function useCartera() {
  const { movimientos, loading, error } = useInversiones()
  const { activos } = useActivos()
  const { categorias } = useCategorias()
  const { cierres } = useCierres()
  const { valuaciones, falta, recargar } = useValuaciones()
  const monedas = ['USD', ...movimientos.map((m) => m.moneda), ...activos.filter((a) => a.divisa).map((a) => a.divisa!), ...valuaciones.map((v) => v.moneda)]
  const tipos = useTiposHoy(monedas, cierres[0]?.tipos)
  const mepEn = useMepHistorico()

  const posiciones = armarCartera(movimientos, { activos, categorias, tipos, mepEn, valuaciones, ultimoCierre: cierres[0] })
  const totales = totalesCartera(posiciones)
  return {
    posiciones,
    totales,
    categorias,
    tipos,
    loading,
    error,
    faltaSql: falta,
    hayMepHistorico: Boolean(mepEn),
    recargarValuaciones: recargar,
  }
}
