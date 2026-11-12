import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Target } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import TarjetaObjetivo from '../components/TarjetaObjetivo'
import { BotonOjo } from '../lib/ocultar'
import { useObjetivosConContexto } from '../lib/contextoObjetivos'
import { calcularPlan, calcularProgreso } from '../lib/objetivos'

export default function Objetivos() {
  const { objetivos, vinculos, aportes, loading, error, ctx, cierres } = useObjetivosConContexto()
  const [verCumplidos, setVerCumplidos] = useState(false)
  const vigentes = objetivos.filter((o) => o.estado !== 'cumplido')
  const cumplidos = objetivos.filter((o) => o.estado === 'cumplido')

  const tarjeta = (o: (typeof objetivos)[number]) => {
    const progreso = calcularProgreso(o, vinculos, aportes, ctx)
    return <TarjetaObjetivo key={o.id} obj={o} progreso={progreso} plan={calcularPlan(o, progreso, aportes, cierres)} />
  }

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Objetivos</h1>
        </div>
        <div className="topbar-der">
          <BotonOjo className="boton-icono" />
          <Link to="/objetivos/nuevo" className="boton-icono" aria-label="Nuevo objetivo">
            <Plus size={22} />
          </Link>
        </div>
      </header>

      {error && (
        <p className="error">
          {/relation|does not exist|schema cache/i.test(error)
            ? 'Falta ejecutar el SQL de objetivos en Supabase.'
            : `No se pudieron cargar los objetivos: ${error}`}
        </p>
      )}

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : vigentes.length === 0 ? (
        <section className="card vacio">
          <span className="icono-cat grande" aria-hidden="true">
            <Target size={28} />
          </span>
          <h2>¿Para qué estás ahorrando?</h2>
          <p className="muted">
            Una compu, cambiar el celular, un viaje… Poné cuánto cuesta y, si querés, para cuándo. La app te dice
            cuánto separar por mes y cómo venís.
          </p>
          <Link to="/objetivos/nuevo" className="primary boton">
            Crear un objetivo
          </Link>
        </section>
      ) : (
        <div className="lista-objetivos">{vigentes.map(tarjeta)}</div>
      )}

      {ctx.tipos.size === 0 && vigentes.some((o) => o.moneda !== 'ARS') && (
        <p className="muted chico">
          * No pude traer el dólar de hoy. Los montos en otras monedas se van a convertir cuando haya conexión o con tu
          próximo cierre de mes.
        </p>
      )}

      {cumplidos.length > 0 && (
        <section className="cumplidos">
          <button className="link" onClick={() => setVerCumplidos((v) => !v)} aria-expanded={verCumplidos}>
            {verCumplidos ? 'Ocultar' : 'Ver'} cumplidos ({cumplidos.length})
          </button>
          {verCumplidos && <div className="lista-objetivos">{cumplidos.map(tarjeta)}</div>}
        </section>
      )}
      <BottomNav />
    </main>
  )
}
