import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import { CAMPOS_MOV, normalizar, useCategorias, useCuentas, useSaldosCuentas, nombreCuenta, type Movimiento } from '../lib/datos'
import { formatMonto, mesActual, nombreDia, type Moneda } from '../lib/format'
import { Oculto } from '../lib/ocultar'
import { supabase } from '../lib/supabase'

const r2 = (n: number) => Math.round(n * 100) / 100
const inicial = (n: string) => n.trim().charAt(0).toUpperCase()

/** Deudas 1 a 1: una fila por persona con lo que te debe o le debés. */
export default function Deudas() {
  const { cuentas } = useCuentas()
  const { saldos } = useSaldosCuentas(mesActual())
  const [verSaldadas, setVerSaldadas] = useState(false)
  const personas = cuentas
    .filter((c) => c.tipo === 'persona')
    .map((c) => ({ c, saldos: saldos.filter((s) => s.cuenta_id === c.id && Math.abs(s.monto) >= 0.01) }))
  const pendientes = personas.filter((p) => p.saldos.length > 0).sort((a, b) => b.saldos[0].monto - a.saldos[0].monto)
  const saldadas = personas.filter((p) => p.saldos.length === 0)

  const fila = ({ c, saldos: ss }: (typeof personas)[number]) => {
    const aFavor = ss.length > 0 && ss[0].monto > 0
    return (
      <li key={c.id}>
        <Link to={`/deudas/${c.id}`} className="deuda-fila">
          <span className={`deuda-inicial ${ss.length === 0 ? '' : aFavor ? 'a-favor' : 'en-contra'}`} aria-hidden="true">
            {inicial(c.nombre)}
          </span>
          <span className="deuda-nombre">{c.nombre}</span>
          <span className="deuda-saldo">
            {ss.length === 0 ? (
              <span className="muted chico">Saldada</span>
            ) : (
              ss.map((s) => (
                <span key={s.moneda} className={s.monto > 0 ? 'positivo' : 'negativo'}>
                  <small className="muted">{s.monto > 0 ? 'te debe' : 'le debés'}</small>
                  <Oculto>{formatMonto(r2(Math.abs(s.monto)), s.moneda)}</Oculto>
                </span>
              ))
            )}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <main className="screen con-nav deudas-pantalla">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Deudas</h1>
        </div>
      </header>
      <p className="muted">
        Plata que prestaste, que te prestaron o gastos tuyos que pagó otra persona. Nada de esto cuenta como gasto o ingreso
        hasta que sea de verdad tuyo.
      </p>
      <div className="grupos-cabecera">
        <h2>{pendientes.length ? `Pendientes (${pendientes.length})` : 'Pendientes'}</h2>
        <Link to="/nuevo?tipo=prestamo" className="boton-contorno">
          <Plus size={16} aria-hidden="true" /> Nuevo
        </Link>
      </div>
      {pendientes.length === 0 ? (
        <p className="muted card">
          No tenés préstamos pendientes. Para anotar uno, tocá "Nuevo" (o en Nuevo movimiento, el tipo Préstamo). Si alguien
          pagó algo tuyo, cargalo como gasto y en "Pagaste con" elegí o escribí su nombre.
        </p>
      ) : (
        <ul className="deudas-lista">{pendientes.map(fila)}</ul>
      )}
      {saldadas.length > 0 && (
        <>
          <button className="link-discreto" onClick={() => setVerSaldadas((v) => !v)}>
            {verSaldadas ? 'Ocultar saldadas' : `Saldadas (${saldadas.length})`}
          </button>
          {verSaldadas && <ul className="deudas-lista">{saldadas.map(fila)}</ul>}
        </>
      )}
      <BottomNav />
    </main>
  )
}

/** Detalle de una persona: saldo, historial y acciones. */
export function DeudaDetalle() {
  const { id } = useParams()
  const { cuentas } = useCuentas()
  const { categorias } = useCategorias()
  const { saldos } = useSaldosCuentas(mesActual())
  const [movs, setMovs] = useState<Movimiento[] | null>(null)
  useEffect(() => {
    if (!id) return
    supabase
      .from('movimientos')
      .select(CAMPOS_MOV)
      .or(`cuenta_id.eq.${id},cuenta_destino_id.eq.${id}`)
      .order('fecha', { ascending: false })
      .then(({ data }) => setMovs((data ?? []).map((m) => normalizar(m as Record<string, unknown>))))
  }, [id])
  const persona = cuentas.find((c) => c.id === id)
  if (!persona) return <main className="screen center muted">Cargando…</main>
  const ss = saldos.filter((s) => s.cuenta_id === id && Math.abs(s.monto) >= 0.01)
  const cuenta = new Map(cuentas.map((c) => [c.id, c]))
  const catNombre = new Map(categorias.map((c) => [c.id, c.nombre]))
  const principal: { moneda: Moneda; monto: number } | undefined = ss[0]
  const meDebe = principal ? principal.monto > 0 : false

  const describir = (m: Movimiento) => {
    if (m.tipo === 'gasto') return { texto: `Pagó ${catNombre.get(m.categoria_id ?? '')?.toLowerCase() ?? 'algo'} tuyo`, signo: -1 }
    if (m.cuenta_destino_id === id)
      return { texto: `Le diste plata · salió de ${cuenta.get(m.cuenta_id) ? nombreCuenta(cuenta.get(m.cuenta_id)!) : '—'}`, signo: 1 }
    return { texto: `Te dio plata · entró a ${cuenta.get(m.cuenta_destino_id ?? '') ? nombreCuenta(cuenta.get(m.cuenta_destino_id!)!) : '—'}`, signo: -1 }
  }

  return (
    <main className="screen deuda-detalle">
      <header className="topbar">
        <Link to="/deudas" className="link">
          ← Deudas
        </Link>
      </header>
      <section className="hero">
        <p className="hero-etiqueta">
          {ss.length === 0 ? `Con ${persona.nombre} están a mano` : meDebe ? `${persona.nombre} te debe` : `Le debés a ${persona.nombre}`}
        </p>
        {ss.length > 0 && (
          <p className={`hero-monto ${meDebe ? 'positivo' : 'negativo'}`}>
            <Oculto>{ss.map((s) => formatMonto(r2(Math.abs(s.monto)), s.moneda)).join(' + ')}</Oculto>
          </p>
        )}
      </section>
      <div className="deuda-acciones">
        <Link to={`/nuevo?tipo=prestamo&persona=${id}&sentido=di`} className={`boton ${meDebe || !ss.length ? 'secundario-link' : 'primary'}`}>
          {meDebe || !ss.length ? 'Prestarle más' : 'Le pagué'}
        </Link>
        <Link to={`/nuevo?tipo=prestamo&persona=${id}&sentido=recibi`} className={`boton ${meDebe ? 'primary' : 'secundario-link'}`}>
          {meDebe ? 'Me pagó' : 'Me prestó más'}
        </Link>
      </div>
      <section className="bloque-plano">
        <h2>Historial</h2>
        {movs === null ? (
          <p className="muted">Cargando…</p>
        ) : movs.length === 0 ? (
          <p className="muted">Todavía no hay movimientos con {persona.nombre}.</p>
        ) : (
          <ul className="lista card">
            {movs.map((m) => {
              const d = describir(m)
              return (
                <li key={m.id}>
                  <Link to={`/movimiento/${m.id}`} className="fila fila-mov">
                    <div className="mov-texto">
                      <div className="mov-titulo">{d.texto}</div>
                      <div className="muted chico mov-detalle">
                        {nombreDia(m.fecha)}/{m.fecha.slice(5, 7)}
                        {m.nota ? ` · ${m.nota}` : ''}
                      </div>
                    </div>
                    <div className={`monto ${d.signo > 0 ? 'ingreso' : 'gasto'}`}>
                      <Oculto>
                        {d.signo > 0 ? '+ ' : '− '}
                        {formatMonto(m.monto, m.moneda)}
                      </Oculto>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <p className="muted chico">+ suma a lo que te debe · − baja lo que te debe (o suma a lo que le debés)</p>
      </section>
    </main>
  )
}
