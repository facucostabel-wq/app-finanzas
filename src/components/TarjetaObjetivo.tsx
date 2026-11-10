import { Link } from 'react-router-dom'
import { formatMonto } from '../lib/format'
import type { Plan, Progreso } from '../lib/objetivos'
import type { Objetivo } from '../lib/objetivos'
import IconoCategoria from './IconoCategoria'

const redondo = (n: number) => Math.round(n)

export function textoPlan(obj: Objetivo, plan: Plan): string {
  if (obj.estado === 'pausado') return 'En pausa'
  if (obj.estado === 'cumplido') return 'Cumplido'
  if (plan.tipo === 'cumplido') return '¡Llegaste! Ya podés comprarlo'
  if (plan.tipo === 'con-fecha') {
    if (plan.estado === 'vencido') return 'Pasó la fecha: elegí una nueva'
    const porMes = `Separá ${formatMonto(redondo(plan.porMes), obj.moneda)} por mes`
    const estado = { adelantado: 'vas adelantado', 'al-dia': 'vas al día', atrasado: 'vas atrasado' }[plan.estado]
    return `${porMes} · ${estado}`
  }
  if (plan.llegada) {
    const fecha = plan.llegada.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
    return `A este ritmo llegás en ${fecha}`
  }
  return 'Sin fecha: sumá aportes para estimar cuándo llegás'
}

export default function TarjetaObjetivo({
  obj,
  progreso,
  plan,
  compacta = false,
}: {
  obj: Objetivo
  progreso: Progreso
  plan: Plan
  compacta?: boolean
}) {
  const estadoClase =
    plan.tipo === 'con-fecha' && (plan.estado === 'atrasado' || plan.estado === 'vencido') ? 'atrasado' : ''
  return (
    <Link to={`/objetivos/${obj.id}`} className={`objetivo ${compacta ? 'compacta' : 'card'} ${obj.estado}`}>
      <div className="objetivo-cabecera">
        <IconoCategoria nombre={obj.nombre} icono={obj.icono} tipo="gasto" />
        <div className="objetivo-titulo">
          <span className="objetivo-nombre">{obj.nombre}</span>
          <span className="muted chico">
            {formatMonto(redondo(progreso.total), obj.moneda)} de {formatMonto(obj.monto, obj.moneda)}
            {progreso.faltaTipo && ' *'}
          </span>
        </div>
        <span className="objetivo-porcentaje">{Math.floor(progreso.porcentaje)}%</span>
      </div>
      <div className="objetivo-pista" role="progressbar" aria-valuenow={Math.floor(progreso.porcentaje)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${obj.nombre}`}>
        <div className="objetivo-barra" style={{ width: `${progreso.porcentaje}%` }} />
      </div>
      <span className={`chico objetivo-plan ${estadoClase}`}>{textoPlan(obj, plan)}</span>
    </Link>
  )
}
