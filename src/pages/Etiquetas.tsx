import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarRange, Hash, Plus } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import IconoCategoria from '../components/IconoCategoria'
import { convertir } from '../lib/cotizaciones'
import { useMepHistorico, useTiposHoy } from '../lib/cotizaciones'
import { CAMPOS_MOV, normalizar, useCategorias, type Movimiento } from '../lib/datos'
import { crearEtiqueta, esEvento, useEtiquetas, vigenteEn, type Etiqueta, type Etiquetado } from '../lib/etiquetas'
import { formatMonto, hoyISO, nombreDia, type Moneda } from '../lib/format'
import { Oculto } from '../lib/ocultar'
import { supabase } from '../lib/supabase'

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}${iso.slice(0, 4) !== hoyISO().slice(0, 4) ? `/${iso.slice(2, 4)}` : ''}`
export const rangoEvento = (e: Etiqueta) =>
  e.desde && e.hasta ? `del ${fechaCorta(e.desde)} al ${fechaCorta(e.hasta)}` : e.desde ? `desde el ${fechaCorta(e.desde)}` : `hasta el ${fechaCorta(e.hasta!)}`

/** Movimientos etiquetados (los propios y las cuotas de compras etiquetadas). */
function useMovimientosEtiquetados(etiquetado: Etiquetado[]) {
  const [movs, setMovs] = useState<Movimiento[]>([])
  const clave = etiquetado.map((x) => x.id).join(',')
  useEffect(() => {
    const ids = [...new Set(etiquetado.map((x) => x.movimiento_id).filter(Boolean))] as string[]
    const compras = [...new Set(etiquetado.map((x) => x.compra_id).filter(Boolean))] as string[]
    Promise.all([
      ids.length ? supabase.from('movimientos').select(CAMPOS_MOV).in('id', ids) : Promise.resolve({ data: [] }),
      compras.length ? supabase.from('movimientos').select(CAMPOS_MOV).in('compra_id', compras) : Promise.resolve({ data: [] }),
    ]).then(([a, b]) => {
      const todos = [...(a.data ?? []), ...(b.data ?? [])].map((m) => normalizar(m as Record<string, unknown>))
      setMovs([...new Map(todos.map((m) => [m.id, m])).values()].sort((x, y) => y.fecha.localeCompare(x.fecha)))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave])
  return movs
}

/** Movimientos de una etiqueta. */
const deEtiqueta = (movs: Movimiento[], etiquetado: Etiquetado[], etiquetaId: string) => {
  const ids = new Set(etiquetado.filter((x) => x.etiqueta_id === etiquetaId && x.movimiento_id).map((x) => x.movimiento_id))
  const compras = new Set(etiquetado.filter((x) => x.etiqueta_id === etiquetaId && x.compra_id).map((x) => x.compra_id))
  return movs.filter((m) => ids.has(m.id) || (m.compra_id && compras.has(m.compra_id)))
}

/** Gastos por moneda. */
function gastosPorMoneda(movs: Movimiento[]) {
  const t = new Map<Moneda, number>()
  for (const m of movs) if (m.tipo === 'gasto') t.set(m.moneda, (t.get(m.moneda) ?? 0) + m.monto)
  return t
}

export default function Etiquetas() {
  const { etiquetas, etiquetado, falta, recargar } = useEtiquetas()
  const movs = useMovimientosEtiquetados(etiquetado)
  const [creando, setCreando] = useState(false)
  const hoy = hoyISO()
  const eventos = etiquetas.filter(esEvento).sort((a, b) => (b.desde ?? b.hasta ?? '').localeCompare(a.desde ?? a.hasta ?? ''))
  const simples = etiquetas.filter((e) => !esEvento(e)).sort((a, b) => a.nombre.localeCompare(b.nombre))

  const fila = (e: Etiqueta) => {
    const suyos = deEtiqueta(movs, etiquetado, e.id)
    const totales = [...gastosPorMoneda(suyos)]
    return (
      <li key={e.id}>
        <Link to={`/etiquetas/${e.id}`} className="etiqueta-fila">
          <span className="etiqueta-icono" aria-hidden="true">
            {esEvento(e) ? <CalendarRange size={18} /> : <Hash size={18} />}
          </span>
          <span className="etiqueta-texto">
            <span>
              {e.nombre}
              {vigenteEn(e, hoy) && <span className="badge-en-curso">En curso</span>}
            </span>
            <span className="muted chico">
              {esEvento(e) ? `${rangoEvento(e)} · ` : ''}
              {suyos.length === 1 ? '1 movimiento' : `${suyos.length} movimientos`}
            </span>
          </span>
          <span className="etiqueta-total">
            <Oculto>{totales.length ? totales.map(([m, v]) => formatMonto(v, m)).join(' + ') : '—'}</Oculto>
          </span>
        </Link>
      </li>
    )
  }

  return (
    <main className="screen con-nav etiquetas-pantalla">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Etiquetas</h1>
        </div>
      </header>
      <p className="muted">
        Agrupan movimientos de distintas categorías, como todo lo de un viaje. Un <strong>evento</strong> tiene fechas: mientras
        dura, su etiqueta se agrega sola a lo que cargues.
      </p>
      {falta && <p className="error chico">Falta actualizar la base (SQL 0021) para usar etiquetas.</p>}

      {creando ? (
        <NuevaEtiqueta
          onListo={() => {
            setCreando(false)
            recargar()
          }}
          onCancelar={() => setCreando(false)}
        />
      ) : (
        <div className="grupos-cabecera">
          <h2>{etiquetas.length ? `Tus etiquetas (${etiquetas.length})` : 'Tus etiquetas'}</h2>
          <button className="boton-contorno" onClick={() => setCreando(true)} disabled={falta}>
            <Plus size={16} aria-hidden="true" /> Nueva
          </button>
        </div>
      )}

      {!etiquetas.length && !creando && (
        <p className="muted card">
          Todavía no tenés etiquetas. Creá un evento (por ejemplo, "Bariloche" del 10 al 15/12) o agregá una etiqueta desde
          cualquier movimiento.
        </p>
      )}
      {eventos.length > 0 && (
        <>
          <h3 className="subtitulo-lista">Eventos</h3>
          <ul className="etiquetas-lista">{eventos.map(fila)}</ul>
        </>
      )}
      {simples.length > 0 && (
        <>
          <h3 className="subtitulo-lista">Etiquetas</h3>
          <ul className="etiquetas-lista">{simples.map(fila)}</ul>
        </>
      )}
      <BottomNav />
    </main>
  )
}

function NuevaEtiqueta({ onListo, onCancelar, inicial }: { onListo: () => void; onCancelar: () => void; inicial?: Etiqueta }) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [evento, setEvento] = useState(inicial ? esEvento(inicial) : true)
  const [desde, setDesde] = useState(inicial?.desde ?? hoyISO())
  const [hasta, setHasta] = useState(inicial?.hasta ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function guardar() {
    setError(null)
    const limpio = nombre.replace(/^#/, '').trim()
    if (!limpio) return setError('Poné un nombre.')
    if (evento && !desde && !hasta) return setError('Un evento necesita al menos una fecha.')
    if (evento && desde && hasta && hasta < desde) return setError('La fecha de fin es anterior a la de inicio.')
    setBusy(true)
    const d = evento ? desde || null : null
    const h = evento ? hasta || null : null
    let err: string | null
    if (inicial) {
      const r = await supabase.from('etiquetas').update({ nombre: limpio, desde: d, hasta: h }).eq('id', inicial.id)
      err = r.error ? (r.error.code === '23505' ? 'Ya tenés una etiqueta con ese nombre.' : r.error.message) : null
    } else {
      const r = await crearEtiqueta(limpio, d, h)
      err = r.error
    }
    setBusy(false)
    if (err) return setError(err)
    onListo()
  }

  return (
    <section className="card formulario nueva-etiqueta">
      <label>
        Nombre
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Bariloche" autoFocus={!inicial} />
      </label>
      <div className="segmentado chico" role="group" aria-label="Tipo">
        <button type="button" aria-pressed={evento} onClick={() => setEvento(true)}>
          Evento con fechas
        </button>
        <button type="button" aria-pressed={!evento} onClick={() => setEvento(false)}>
          Etiqueta simple
        </button>
      </div>
      {evento && (
        <div className="fechas-evento">
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
        </div>
      )}
      <p className="muted chico">
        {evento
          ? 'Mientras dure, la etiqueta se agrega sola a lo que cargues con esas fechas (la podés quitar).'
          : 'La agregás a mano en los movimientos que quieras.'}
      </p>
      {error && <p className="error chico">{error}</p>}
      <button className="primary" onClick={guardar} disabled={busy}>
        {busy ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear'}
      </button>
      <button className="link" onClick={onCancelar}>
        Cancelar
      </button>
    </section>
  )
}

/** Detalle de una etiqueta: cuánto se gastó, en qué y cada movimiento. */
export function EtiquetaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { etiquetas, etiquetado, loading, recargar } = useEtiquetas()
  const { categorias } = useCategorias()
  const movsTodos = useMovimientosEtiquetados(etiquetado)
  const mepEn = useMepHistorico()
  const [editando, setEditando] = useState(false)
  const e = etiquetas.find((x) => x.id === id)
  const movs = id ? deEtiqueta(movsTodos, etiquetado, id) : []
  const tipos = useTiposHoy(['USD', ...movs.map((m) => m.moneda)])

  if (loading) return <main className="screen center muted">Cargando…</main>
  if (!e)
    return (
      <main className="screen">
        <p className="muted">No se encontró la etiqueta.</p>
        <Link to="/etiquetas">← Etiquetas</Link>
      </main>
    )

  const gastos = movs.filter((m) => m.tipo === 'gasto')
  const porMoneda = [...gastosPorMoneda(movs)]
  // Total en USD: cada gasto con el dólar de su día (si no, el de hoy).
  let totalUsd = 0
  for (const m of gastos) {
    if (m.moneda === 'USD') totalUsd += m.monto
    else if (m.moneda === 'ARS' && mepEn?.(m.fecha)) totalUsd += m.monto / mepEn(m.fecha)!
    else totalUsd += convertir(m.monto, m.moneda, 'USD', tipos) ?? 0
  }
  const principal = porMoneda.sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ARS'
  const porCat = new Map<string, number>()
  for (const m of gastos) if (m.moneda === principal && m.categoria_id) porCat.set(m.categoria_id, (porCat.get(m.categoria_id) ?? 0) + m.monto)
  const cats = [...porCat].sort((a, b) => b[1] - a[1])
  const max = cats[0]?.[1] ?? 0
  const catDe = new Map(categorias.map((c) => [c.id, c]))

  async function borrar() {
    if (!window.confirm(`¿Borrar la etiqueta "${e!.nombre}"? Los movimientos quedan, solo pierden la etiqueta.`)) return
    const { error } = await supabase.from('etiquetas').delete().eq('id', e!.id)
    if (error) return window.alert(`No se pudo borrar: ${error.message}`)
    navigate('/etiquetas', { replace: true })
  }

  return (
    <main className="screen etiqueta-detalle">
      <header className="topbar">
        <Link to="/etiquetas" className="link">
          ← Etiquetas
        </Link>
        <button className="link" onClick={() => setEditando((v) => !v)}>
          {editando ? 'Cerrar' : 'Editar'}
        </button>
      </header>
      {editando ? (
        <NuevaEtiqueta
          inicial={e}
          onListo={() => {
            setEditando(false)
            recargar()
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <>
          <h1>
            {esEvento(e) ? '' : '#'}
            {e.nombre}
          </h1>
          {esEvento(e) && (
            <p className="muted">
              Evento {rangoEvento(e)}
              {vigenteEn(e, hoyISO()) && <span className="badge-en-curso">En curso</span>}
            </p>
          )}
        </>
      )}

      <section className="hero etiqueta-hero">
        <p className="hero-etiqueta">Gastaste</p>
        <p className="hero-monto">
          <Oculto>{porMoneda.length ? porMoneda.map(([m, v]) => formatMonto(Math.round(v * 100) / 100, m)).join(' + ') : '$ 0'}</Oculto>
        </p>
        {totalUsd > 0 && (
          <p className="hero-otras">
            ≈ <Oculto>{formatMonto(Math.round(totalUsd * 100) / 100, 'USD')}</Oculto> al dólar de cada día
          </p>
        )}
      </section>

      {cats.length > 0 && (
        <section className="bloque-plano">
          <h2>En qué</h2>
          <ul className="categorias">
            {cats.map(([cid, v]) => {
              const c = catDe.get(cid)
              return (
                <li key={cid}>
                  <div className="categoria-link con-icono">
                    <IconoCategoria nombre={c?.nombre ?? ''} tipo="gasto" icono={c?.icono} />
                    <div className="categoria-cuerpo">
                      <div className="categoria-fila">
                        <span>{c?.nombre ?? 'Sin categoría'}</span>
                        <span className="categoria-monto">
                          <Oculto>{formatMonto(v, principal)}</Oculto>
                        </span>
                      </div>
                      <div className="categoria-pista" aria-hidden="true">
                        <div className="categoria-barra" style={{ width: `${max ? (v / max) * 100 : 0}%` }} />
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="bloque-plano">
        <h2>Movimientos ({movs.length})</h2>
        {movs.length === 0 ? (
          <p className="muted">Todavía no hay movimientos con esta etiqueta.</p>
        ) : (
          <ul className="lista card">
            {movs.map((m) => {
              const c = m.categoria_id ? catDe.get(m.categoria_id) : undefined
              return (
                <li key={m.id}>
                  <Link to={`/movimiento/${m.id}`} className="fila fila-mov">
                    <IconoCategoria nombre={c?.nombre ?? ''} tipo={m.tipo} icono={c?.icono} />
                    <div className="mov-texto">
                      <div className="mov-titulo">{c?.nombre ?? 'Movimiento'}</div>
                      <div className="muted chico mov-detalle">
                        {nombreDia(m.fecha)}/{m.fecha.slice(5, 7)}
                        {m.nota ? ` · ${m.nota}` : ''}
                      </div>
                    </div>
                    <div className={`monto ${m.tipo}`}>
                      <Oculto>
                        {m.tipo === 'gasto' ? '− ' : m.tipo === 'ingreso' ? '+ ' : ''}
                        {formatMonto(m.monto, m.moneda)}
                      </Oculto>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editando && (
        <button className="peligro boton-ancho" onClick={borrar}>
          Borrar etiqueta
        </button>
      )}
    </main>
  )
}
