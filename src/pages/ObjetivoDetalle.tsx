import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Landmark, LineChart, Pencil, PiggyBank, X } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import Combobox, { type Opcion } from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import { textoPlan } from '../components/TarjetaObjetivo'
import { useObjetivosConContexto } from '../lib/contextoObjetivos'
import { nombreCuenta, TEXTO_TIPO_CUENTA, useCategorias } from '../lib/datos'
import { formatMonto, hoyISO, montoAEditable, parseMonto } from '../lib/format'
import { calcularPlan, calcularProgreso } from '../lib/objetivos'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'
import InputNumero from '../components/InputNumero'

type Hoja = 'apartar' | 'liberar' | 'vincular' | 'comprar' | null

const fechaCorta = (f: string) =>
  new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

export default function ObjetivoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { objetivos, vinculos, aportes, loading, ctx, cierres, recargar } = useObjetivosConContexto()
  const { categorias } = useCategorias()
  const [hoja, setHoja] = useState<Hoja>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Campos de las hojas
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [nota, setNota] = useState('')
  const [vinculo, setVinculo] = useState<string | null>(null)
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [fecha, setFecha] = useState(hoyISO())

  const obj = objetivos.find((o) => o.id === id)
  if (loading) return <main className="screen"><p className="muted">Cargando…</p></main>
  if (!obj)
    return (
      <main className="screen">
        <p className="muted">No se encontró el objetivo.</p>
        <Link to="/objetivos">Volver a objetivos</Link>
      </main>
    )

  const progreso = calcularProgreso(obj, vinculos, aportes, ctx)
  const plan = calcularPlan(obj, progreso, aportes, cierres)
  const misAportes = aportes.filter((a) => a.objetivo_id === obj.id).slice().reverse()
  const cuentaPorId = new Map(ctx.cuentas.map((c) => [c.id, c]))
  const vinculadas = new Set(vinculos.map((v) => v.cuenta_id).filter(Boolean))
  const activosVinculados = new Set(vinculos.map((v) => v.activo_id).filter(Boolean))
  const falta = Math.max(0, obj.monto - progreso.total)
  const vigente = obj.estado !== 'cumplido'

  const favoritas = perfil?.monedas_favoritas ?? ['ARS', 'USD']
  const opcionesMoneda: Opcion[] = [...new Set([obj.moneda, ...favoritas])].map((m) => ({ valor: m, texto: m }))
  const opcionesCuentaOrigen: Opcion[] = ctx.cuentas
    .filter((c) => c.activa && !['tarjeta', 'grupo'].includes(c.tipo) && !vinculadas.has(c.id))
    .map((c) => ({ valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] }))
  const opcionesPago: Opcion[] = ctx.cuentas
    .filter((c) => c.activa && c.tipo !== 'grupo')
    .map((c) => ({ valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] }))
  const conTenencia = new Set(ctx.tenencias.filter((t) => t.cantidad > 0).map((t) => t.activo_id))
  const opcionesVinculo: Opcion[] = [
    ...ctx.cuentas
      .filter((c) => c.activa && !['tarjeta', 'grupo'].includes(c.tipo) && !vinculadas.has(c.id))
      .map((c) => ({ valor: `c:${c.id}`, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo], grupo: 'Una cuenta' })),
    ...ctx.activos
      .filter((a) => !activosVinculados.has(a.id) && (conTenencia.has(a.id) || a.divisa))
      .map((a) => ({ valor: `a:${a.id}`, texto: a.nombre, detalle: a.divisa ? 'Moneda extranjera' : 'Inversión', grupo: 'Una inversión' })),
  ]
  const opcionesCategoria: Opcion[] = categorias
    .filter((c) => c.tipo === 'gasto' && c.activa)
    .map((c) => ({ valor: c.id, texto: c.nombre }))

  function abrir(h: Hoja) {
    setError(null)
    setMoneda(obj!.moneda)
    setCuentaId(null)
    setNota('')
    setVinculo(null)
    setFecha(hoyISO())
    setCategoriaId(categorias.find((c) => c.tipo === 'gasto' && c.icono && obj!.icono && c.icono === obj!.icono)?.id ?? null)
    setMontoTexto(h === 'comprar' ? montoAEditable(obj!.monto) : '')
    setHoja(h)
  }

  async function ejecutar(fn: () => Promise<string | null>) {
    setBusy(true)
    setError(null)
    const e = await fn()
    setBusy(false)
    if (e) return setError(e)
    setHoja(null)
    recargar()
  }

  const guardarAporte = (signo: 1 | -1) =>
    ejecutar(async () => {
      const monto = parseMonto(montoTexto)
      if (!monto || monto <= 0) return 'Poné un monto.'
      if (signo === 1 && !cuentaId) return 'Elegí de qué cuenta sale.'
      const { error } = await supabase.from('objetivo_aportes').insert({
        objetivo_id: obj.id,
        monto: signo * monto,
        moneda,
        cuenta_id: cuentaId,
        nota: nota.trim() || null,
        fecha: hoyISO(),
      })
      return error?.message ?? null
    })

  const guardarVinculo = () =>
    ejecutar(async () => {
      if (!vinculo) return 'Elegí una cuenta o inversión.'
      const fila = vinculo.startsWith('c:') ? { cuenta_id: vinculo.slice(2) } : { activo_id: vinculo.slice(2) }
      const { error } = await supabase.from('objetivo_vinculos').insert({ objetivo_id: obj.id, ...fila })
      if (error?.code === '23505') return 'Eso ya está destinado a otro objetivo.'
      return error?.message ?? null
    })

  const comprar = () =>
    ejecutar(async () => {
      const monto = parseMonto(montoTexto)
      if (!monto || monto <= 0) return 'Poné cuánto pagaste.'
      if (!categoriaId) return 'Elegí la categoría del gasto.'
      if (!cuentaId) return 'Elegí con qué pagaste.'
      const { error } = await supabase.from('movimientos').insert({
        tipo: 'gasto',
        monto,
        moneda,
        categoria_id: categoriaId,
        cuenta_id: cuentaId,
        cuenta_destino_id: null,
        forma_pago: null,
        activo_id: null,
        cantidad: null,
        fecha,
        nota: obj.nombre,
      })
      if (error) return error.message
      // Se cumple: la plata deja de estar reservada y las cuentas quedan libres para otro objetivo.
      await supabase.from('objetivo_vinculos').delete().eq('objetivo_id', obj.id)
      const r = await supabase
        .from('objetivos')
        .update({ estado: 'cumplido', cumplido_at: new Date().toISOString() })
        .eq('id', obj.id)
      return r.error?.message ?? null
    })

  async function cambiarEstado(estado: 'activo' | 'pausado') {
    await supabase.from('objetivos').update({ estado }).eq('id', obj!.id)
    recargar()
  }
  async function borrar() {
    if (!window.confirm(`¿Borrar "${obj!.nombre}"? Se borran también sus aportes. La plata de tus cuentas no cambia.`)) return
    await supabase.from('objetivos').delete().eq('id', obj!.id)
    navigate('/objetivos', { replace: true })
  }
  async function quitarVinculo(vid: string) {
    await supabase.from('objetivo_vinculos').delete().eq('id', vid)
    recargar()
  }
  async function borrarAporte(aid: string) {
    if (!window.confirm('¿Borrar este movimiento del objetivo?')) return
    await supabase.from('objetivo_aportes').delete().eq('id', aid)
    recargar()
  }

  return (
    <main className="screen con-nav">
      <header className="subpagina">
        <div className="subpagina-fila">
          <Link to="/objetivos" className="volver">
            ‹ Objetivos
          </Link>
          {vigente && (
            <Link to={`/objetivos/${obj.id}/editar`} className="boton-icono" aria-label="Editar objetivo">
              <Pencil size={18} />
            </Link>
          )}
        </div>
      </header>

      <section className="objetivo-hero">
        <IconoCategoria nombre={obj.nombre} icono={obj.icono} tipo="gasto" />
        <h1>{obj.nombre}</h1>
        <p className="objetivo-cifra">
          <strong>{formatMonto(Math.round(progreso.total), obj.moneda)}</strong>
          <span className="muted"> de {formatMonto(obj.monto, obj.moneda)}</span>
        </p>
        <div className="objetivo-pista grande" role="progressbar" aria-valuenow={Math.floor(progreso.porcentaje)} aria-valuemin={0} aria-valuemax={100}>
          <div className="objetivo-barra" style={{ width: `${progreso.porcentaje}%` }} />
        </div>
        <p className="muted chico">
          {Math.floor(progreso.porcentaje)}% · {obj.fecha ? `para el ${fechaCorta(obj.fecha)}` : 'sin fecha'}
          {falta > 0 && vigente ? ` · faltan ${formatMonto(Math.round(falta), obj.moneda)}` : ''}
        </p>
        <p className="objetivo-plan-grande">{textoPlan(obj, plan)}</p>
        {progreso.faltaTipo && (
          <p className="muted chico">* Hay montos en otra moneda que no pude convertir: falta el tipo de cambio.</p>
        )}
        {progreso.alCosto && (
          <p className="muted chico">Las inversiones sin cierre de mes cuentan por lo que pagaste, no por lo que valen hoy.</p>
        )}
      </section>

      <section className="card">
        <h2>De dónde sale la plata</h2>
        {progreso.fuentes.length === 0 ? (
          <p className="muted chico">Todavía nada. Apartá plata o destiná una cuenta o inversión a este objetivo.</p>
        ) : (
          <ul className="lista">
            {progreso.fuentes.map((f) => (
              <li key={f.clave} className="fila fuente">
                <span className="icono-cat chico-icono" aria-hidden="true">
                  {f.tipo === 'apartado' ? <PiggyBank size={18} /> : f.tipo === 'cuenta' ? <Landmark size={18} /> : <LineChart size={18} />}
                </span>
                <div className="fuente-texto">
                  <span>{f.nombre}</span>
                  <span className="muted chico">
                    {f.tipo === 'cuenta' ? 'Toda la cuenta' : f.tipo === 'activo' ? (f.alCosto ? 'Inversión (al costo)' : 'Inversión') : 'Separado de tus cuentas'}
                    {f.original.some((o) => o.moneda !== obj.moneda) &&
                      ` · ${f.original.map((o) => formatMonto(Math.round(o.monto), o.moneda)).join(' + ')}`}
                  </span>
                </div>
                <span className="monto">{f.valor === null ? '—' : formatMonto(Math.round(f.valor), obj.moneda)}</span>
                {f.tipo !== 'apartado' && vigente && (
                  <button className="icono-quitar" onClick={() => quitarVinculo(f.clave)} aria-label={`Dejar de destinar ${f.nombre}`}>
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {vigente && (
          <div className="acciones-objetivo">
            <button className="primary" onClick={() => abrir('apartar')}>
              Apartar plata
            </button>
            <button className="secundario" onClick={() => abrir('vincular')}>
              Destinar una cuenta o inversión
            </button>
            {misAportes.length > 0 && (
              <button className="secundario" onClick={() => abrir('liberar')}>
                Usar o liberar parte
              </button>
            )}
          </div>
        )}
      </section>

      {misAportes.length > 0 && (
        <section className="card">
          <h2>Historial de apartados</h2>
          <ul className="lista">
            {misAportes.map((a) => (
              <li key={a.id} className="fila">
                <div>
                  <div>{a.monto > 0 ? 'Apartaste' : 'Usaste o liberaste'}</div>
                  <div className="muted chico">
                    {fechaCorta(a.fecha)}
                    {a.cuenta_id && cuentaPorId.get(a.cuenta_id) ? ` · ${nombreCuenta(cuentaPorId.get(a.cuenta_id)!)}` : ''}
                    {a.nota ? ` · ${a.nota}` : ''}
                  </div>
                </div>
                <span className={`monto ${a.monto > 0 ? 'ingreso' : ''}`}>
                  {a.monto > 0 ? '+' : '−'} {formatMonto(Math.abs(a.monto), a.moneda)}
                </span>
                {vigente && (
                  <button className="icono-quitar" onClick={() => borrarAporte(a.id)} aria-label="Borrar">
                    <X size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="acciones-finales">
        {vigente ? (
          <>
            <button className="primary" onClick={() => abrir('comprar')}>
              Lo compré
            </button>
            <button className="secundario" onClick={() => cambiarEstado(obj.estado === 'pausado' ? 'activo' : 'pausado')}>
              {obj.estado === 'pausado' ? 'Reanudar' : 'Pausar'}
            </button>
          </>
        ) : (
          <p className="muted">
            Cumplido el {new Date(obj.cumplido_at ?? obj.creado_at).toLocaleDateString('es-AR')}. 🎉
          </p>
        )}
        <button className="peligro" onClick={borrar}>
          Borrar objetivo
        </button>
      </section>

      {hoja && (
        <div className="hoja-fondo" onClick={() => setHoja(null)}>
          <div className="hoja formulario" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-cabecera">
              <h2>
                {hoja === 'apartar'
                  ? 'Apartar plata'
                  : hoja === 'liberar'
                    ? 'Usar o liberar parte'
                    : hoja === 'vincular'
                      ? 'Destinar a este objetivo'
                      : '¡Lo compraste!'}
              </h2>
              <button className="boton-icono" onClick={() => setHoja(null)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>

            {hoja === 'vincular' ? (
              <>
                <p className="muted chico">
                  Todo lo que haya en esa cuenta o inversión cuenta para el objetivo, y sube o baja con su saldo. Cada
                  cuenta o inversión puede estar destinada a un solo objetivo.
                </p>
                <Combobox etiqueta="Cuenta o inversión" opciones={opcionesVinculo} valor={vinculo} onCambio={setVinculo} />
                {opcionesVinculo.length === 0 && <p className="muted chico">No hay cuentas ni inversiones libres.</p>}
              </>
            ) : (
              <>
                {hoja === 'comprar' && (
                  <p className="muted chico">
                    Se registra el gasto y el objetivo queda cumplido. Lo que tenía reservado vuelve a tu disponible.
                  </p>
                )}
                {hoja === 'liberar' && (
                  <p className="muted chico">Lo que liberes vuelve a tu disponible para gastar.</p>
                )}
                <div className="monto-y-moneda">
                  <label>
                    {hoja === 'comprar' ? '¿Cuánto pagaste?' : 'Monto'}
                    <InputNumero className="monto-input" value={montoTexto} onChange={setMontoTexto} placeholder="0" autoFocus />
                  </label>
                  <Combobox etiqueta="Moneda" opciones={opcionesMoneda} valor={moneda} onCambio={setMoneda} />
                </div>
                {hoja === 'comprar' && (
                  <Combobox etiqueta="Categoría del gasto" opciones={opcionesCategoria} valor={categoriaId} onCambio={setCategoriaId} />
                )}
                <Combobox
                  etiqueta={hoja === 'apartar' ? '¿Dónde está esa plata?' : hoja === 'comprar' ? 'Pagaste con' : '¿De qué cuenta? (opcional)'}
                  opciones={hoja === 'comprar' ? opcionesPago : opcionesCuentaOrigen}
                  valor={cuentaId}
                  onCambio={setCuentaId}
                />
                {hoja === 'comprar' ? (
                  <label>
                    Fecha
                    <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
                  </label>
                ) : (
                  <label>
                    Nota (opcional)
                    <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={80} placeholder={hoja === 'apartar' ? 'Ej.: aguinaldo' : 'Ej.: arreglo del auto'} />
                  </label>
                )}
              </>
            )}

            {error && <p className="error">{error}</p>}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                hoja === 'apartar' ? guardarAporte(1) : hoja === 'liberar' ? guardarAporte(-1) : hoja === 'vincular' ? guardarVinculo() : comprar()
              }
            >
              {busy ? 'Guardando…' : hoja === 'comprar' ? 'Registrar compra' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
