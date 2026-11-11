import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { marcarLeidas } from '../lib/push'
import Combobox, { type Opcion } from '../components/Combobox'
import { nombreCuenta, TEXTO_TIPO_CUENTA, useCategorias, useCuentas } from '../lib/datos'
import { formatMonto, hoyISO, montoAEditable, nombreDia, parseMonto } from '../lib/format'
import {
  calcularPendientes,
  calcularSaldos,
  linkInvitacion,
  registrarGasto,
  registrarPago,
  simplificarDeudas,
  useGrupo,
  type Deuda,
  type Pendiente,
} from '../lib/grupos'
import { supabase } from '../lib/supabase'
import InputNumero from '../components/InputNumero'

const r2 = (n: number) => Math.round(n * 100) / 100

// Recuerda la última categoría usada en cada grupo (comodidad local).
const leerCat = (g: string) => {
  try {
    return localStorage.getItem(`cat-grupo:${g}`)
  } catch {
    return null
  }
}
const guardarCat = (g: string, c: string) => {
  try {
    localStorage.setItem(`cat-grupo:${g}`, c)
  } catch {
    /* sin almacenamiento */
  }
}

export default function GrupoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { grupo, miembros, gastos, divisiones, pagos, vinculos, cuentaGrupo, miMiembro, esAdmin, adminId, loading, recargar } = useGrupo(id)
  // Al abrir el grupo, sus avisos quedan como leídos.
  useEffect(() => {
    if (id) marcarLeidas(id)
  }, [id])
  const { categorias } = useCategorias()
  const { cuentas } = useCuentas()
  const [invitado, setInvitado] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saldando, setSaldando] = useState<Deuda | null>(null)
  const [verMiembros, setVerMiembros] = useState(false)

  const [uniendo, setUniendo] = useState<string | null>(null)
  const [unirCon, setUnirCon] = useState<string | null>(null)
  const nombre = (m: string) => {
    if (m === miMiembro) return 'Vos'
    const x = miembros.find((y) => y.id === m)
    return x ? (x.removido_at ? `${x.nombre} (ex)` : x.nombre) : '—'
  }
  const activos = miembros.filter((m) => !m.removido_at)
  const exMiembros = miembros.filter((m) => m.removido_at)

  async function accion(rpc: string, args: Record<string, string>, ok?: () => void) {
    setError(null)
    const { error } = await supabase.rpc(rpc, args)
    if (error) {
      setError(/function .* does not exist|schema cache/i.test(error.message) ? 'Falta ejecutar el SQL de administración de grupos en Supabase.' : error.message)
      return
    }
    if (ok) ok()
    else recargar()
  }
  function eliminar(m: { id: string; nombre: string }) {
    if (!window.confirm(`¿Eliminar a ${m.nombre} del grupo? Si ya tiene gastos o pagos, queda como ex miembro: pierde el acceso pero su historial y su saldo siguen.`)) return
    accion('eliminar_miembro', { p_miembro: m.id })
  }
  function unir() {
    if (!uniendo || !unirCon) return
    const inv = miembros.find((m) => m.id === uniendo)?.nombre
    const con = miembros.find((m) => m.id === unirCon)?.nombre
    if (!window.confirm(`¿${inv} (invitado) y ${con} son la misma persona? Todo lo de ${inv} pasa a ${con}.`)) return
    accion('unir_invitado', { p_invitado: uniendo, p_miembro: unirCon }, () => {
      setUniendo(null)
      setUnirCon(null)
      recargar()
    })
  }
  function salir() {
    const extra = esAdmin ? ' Sos el administrador: lo pasa a ser el miembro más antiguo.' : ''
    if (!window.confirm(`¿Salir de "${grupo?.nombre}"? Si tenés gastos o pagos, quedan en el historial del grupo.${extra}`)) return
    accion('salir_grupo', { p_grupo: id! }, () => navigate('/grupos', { replace: true }))
  }
  function borrarGrupo() {
    const escrito = window.prompt(`Esto borra el grupo para todos, con sus gastos y pagos. Lo que cada uno registró en sus finanzas personales queda. Para confirmar, escribí el nombre del grupo: ${grupo?.nombre}`)
    if (escrito === null) return
    if (escrito.trim().toLowerCase() !== grupo?.nombre.trim().toLowerCase()) return setError('El nombre no coincide: el grupo no se borró.')
    accion('borrar_grupo', { p_grupo: id! }, () => navigate('/grupos', { replace: true }))
  }
  const saldos = calcularSaldos(gastos, divisiones, pagos)
  const deudas = simplificarDeudas(saldos)
  const pendientes = calcularPendientes(miMiembro, gastos, divisiones, pagos, vinculos)
  const miSaldo = [...saldos].map(([moneda, m]) => ({ moneda, monto: r2(m.get(miMiembro ?? '') ?? 0) })).filter((x) => Math.abs(x.monto) >= 0.01)

  const opcionesCategoria: Opcion[] = categorias
    .filter((c) => c.tipo === 'gasto' && c.activa)
    .map((c) => ({ valor: c.id, texto: c.nombre }))
  const opcionesCuenta: Opcion[] = cuentas
    .filter((c) => c.activa && c.tipo !== 'grupo')
    .map((c) => ({ valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] }))

  async function invitar() {
    if (!grupo) return
    const link = linkInvitacion(grupo.invitacion_token)
    const texto = `Sumate al grupo "${grupo.nombre}" para dividir gastos: ${link}`
    try {
      if (navigator.share) {
        await navigator.share({ title: grupo.nombre, text: texto })
        return
      }
      await navigator.clipboard.writeText(link)
      setAviso('Link copiado. Pegalo en WhatsApp o donde quieras.')
    } catch {
      setAviso(`Copiá este link: ${link}`)
    }
  }

  async function agregarInvitado() {
    if (!invitado.trim() || !id) return
    const { error } = await supabase.rpc('agregar_invitado', { p_grupo: id, p_nombre: invitado.trim() })
    if (error) return setError(error.message)
    setInvitado('')
    recargar()
  }

  if (loading) return <main className="screen center muted">Cargando…</main>
  if (!grupo) return <main className="screen center muted">No encontramos el grupo.</main>

  // Actividad: gastos y pagos, del más reciente al más viejo.
  const actividad = [
    ...gastos.map((g) => ({ fecha: g.fecha, tipo: 'gasto' as const, g })),
    ...pagos.map((p) => ({ fecha: p.fecha, tipo: 'pago' as const, p })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate('/grupos')}>
          ← Grupos
        </button>
        <button className="link" onClick={invitar}>
          Invitar
        </button>
      </header>
      <h1>{grupo.nombre}</h1>
      <p className="muted chico">
        {activos.length} {activos.length === 1 ? 'miembro' : 'miembros'} ·{' '}
        <button className="link-discreto" onClick={() => setVerMiembros((v) => !v)}>
          {verMiembros ? 'ocultar' : 'ver y agregar'}
        </button>
      </p>
      {aviso && <p className="info">{aviso}</p>}
      {error && <p className="error">{error}</p>}

      {verMiembros && (
        <section className="bloque">
          <ul className="lista">
            {activos.map((m) => (
              <li key={m.id} className="fila miembro-fila">
                <div>
                  <span>{m.id === miMiembro ? `${m.nombre} (vos)` : m.nombre}</span>
                  {m.usuario_id && m.usuario_id === adminId && <span className="etiqueta-auto">admin</span>}
                  <div className="muted chico">{m.usuario_id ? 'Con cuenta' : 'Invitado'}</div>
                </div>
                {esAdmin && m.id !== miMiembro && (
                  <div className="miembro-acciones">
                    {!m.usuario_id && (
                      <button className="link-discreto" onClick={() => setUniendo(uniendo === m.id ? null : m.id)}>
                        Unir
                      </button>
                    )}
                    <button className="link-discreto peligro-texto" onClick={() => eliminar(m)}>
                      Eliminar
                    </button>
                  </div>
                )}
                {uniendo === m.id && (
                  <div className="unir-caja">
                    <p className="chico muted">
                      Si {m.nombre} entró con su cuenta como otro miembro, elegilo: hereda todo lo cargado como invitado.
                    </p>
                    <Combobox
                      etiqueta="Es la misma persona que"
                      opciones={activos
                        .filter((x) => x.usuario_id && x.id !== m.id)
                        .map((x) => ({ valor: x.id, texto: x.id === miMiembro ? `${x.nombre} (vos)` : x.nombre }))}
                      valor={unirCon}
                      onCambio={setUnirCon}
                    />
                    <button className="primary" onClick={unir} disabled={!unirCon}>
                      Unir
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {exMiembros.length > 0 && (
            <p className="muted chico">
              Ex miembros (su historial sigue en el grupo): {exMiembros.map((m) => m.nombre).join(', ')}
            </p>
          )}
          <div className="agregar" style={{ marginTop: 10 }}>
            <input
              value={invitado}
              onChange={(e) => setInvitado(e.target.value)}
              maxLength={40}
              placeholder="Nombre (sin cuenta)"
              aria-label="Nombre del invitado"
            />
            <button className="secundario" onClick={agregarInvitado} disabled={!invitado.trim()}>
              Agregar
            </button>
          </div>
          <p className="muted chico">
            Los invitados sin cuenta se manejan desde acá. Si después entran con el link, eligen "Soy …" y heredan su
            historial.
          </p>
        </section>
      )}

      {/* Mi posición en el grupo */}
      <section className="hero" style={{ marginBottom: 20 }}>
        <p className="hero-etiqueta">Tu saldo en el grupo</p>
        {miSaldo.length === 0 ? (
          <p className="hero-monto" style={{ fontSize: '2rem' }}>
            Al día
          </p>
        ) : (
          miSaldo.map((s) => (
            <p key={s.moneda} className={`hero-monto ${s.monto < 0 ? 'negativo' : ''}`} style={{ fontSize: '2rem' }}>
              {s.monto < 0 ? 'Debés ' : 'Te deben '}
              {formatMonto(Math.abs(s.monto), s.moneda)}
            </p>
          ))
        )}
      </section>

      {/* Quién le paga a quién */}
      {deudas.length > 0 && (
        <section className="bloque">
          <h2>Para quedar a mano</h2>
          <ul className="lista">
            {deudas.map((d, i) => {
              const meInvolucra = d.de === miMiembro || d.a === miMiembro
              return (
                <li key={i} className="fila">
                  <span>
                    {nombre(d.de)} → {nombre(d.a)}
                    <span className="muted chico"> {formatMonto(d.monto, d.moneda)}</span>
                  </span>
                  {meInvolucra && (
                    <button className="secundario chico-boton" onClick={() => setSaldando(d)}>
                      {d.de === miMiembro ? 'Pagar' : 'Me pagó'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {saldando && cuentaGrupo && (
        <Saldar
          deuda={saldando}
          grupoId={grupo.id}
          miMiembro={miMiembro!}
          nombre={nombre}
          cuentaGrupo={cuentaGrupo}
          opcionesCuenta={opcionesCuenta}
          onListo={() => {
            setSaldando(null)
            recargar()
          }}
          onCancelar={() => setSaldando(null)}
        />
      )}

      {/* Pendientes de registrar en mis finanzas */}
      {pendientes.length > 0 && cuentaGrupo && (
        <section className="bloque pendientes">
          <h2>Para registrar en tus finanzas</h2>
          <p className="muted chico">Lo cargó otro miembro. Confirmalo para que impacte en tus gastos y saldos.</p>
          {pendientes.map((p) => (
            <RegistrarPendiente
              key={p.tipo === 'gasto' ? p.gasto.id : p.pago.id}
              pendiente={p}
              grupoId={grupo.id}
              nombre={nombre}
              cuentaGrupo={cuentaGrupo}
              opcionesCategoria={opcionesCategoria}
              opcionesCuenta={opcionesCuenta}
              onListo={recargar}
            />
          ))}
        </section>
      )}

      <Link to={`/grupos/${grupo.id}/gasto/nuevo`} className="primary boton boton-ancho">
        + Cargar gasto del grupo
      </Link>

      {/* Actividad */}
      <section className="bloque-plano" style={{ marginTop: 24 }}>
        <h2>Actividad</h2>
        {actividad.length === 0 && <p className="muted">Todavía no hay gastos en el grupo.</p>}
        <ul className="lista">
          {actividad.map((a) =>
            a.tipo === 'gasto' ? (
              <li key={a.g.id}>
                <Link to={`/grupos/${grupo.id}/gasto/${a.g.id}`} className="fila">
                  <div>
                    <div>{a.g.descripcion}</div>
                    <div className="muted chico">
                      {nombreDia(a.g.fecha)}, {a.g.pagado_por === miMiembro ? 'pagaste vos' : `pagó ${nombre(a.g.pagado_por)}`}
                    </div>
                  </div>
                  <div className="cuentas-montos">
                    <span className="monto">{formatMonto(a.g.monto, a.g.moneda)}</span>
                    {(() => {
                      const mia = divisiones.find((d) => d.gasto_id === a.g.id && d.miembro_id === miMiembro)?.monto
                      return mia ? <span className="muted chico">tu parte {formatMonto(mia, a.g.moneda)}</span> : null
                    })()}
                  </div>
                </Link>
              </li>
            ) : (
              <li key={a.p.id} className="fila">
                <div>
                  <div>
                    {a.p.de_miembro === miMiembro
                      ? `Le pagaste a ${nombre(a.p.a_miembro)}`
                      : a.p.a_miembro === miMiembro
                        ? `${nombre(a.p.de_miembro)} te pagó`
                        : `${nombre(a.p.de_miembro)} le pagó a ${nombre(a.p.a_miembro)}`}
                  </div>
                  <div className="muted chico">{nombreDia(a.p.fecha)}</div>
                </div>
                <span className="monto transferencia">{formatMonto(a.p.monto, a.p.moneda)}</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className="acciones-finales">
        <button className="secundario" onClick={salir}>
          Salir del grupo
        </button>
        {esAdmin && (
          <button className="peligro" onClick={borrarGrupo}>
            Borrar el grupo
          </button>
        )}
        {!esAdmin && <p className="muted chico centrado">Solo el administrador puede borrar el grupo o eliminar miembros.</p>}
      </section>
    </main>
  )
}

function RegistrarPendiente(props: {
  pendiente: Pendiente
  grupoId: string
  nombre: (m: string) => string
  cuentaGrupo: string
  opcionesCategoria: Opcion[]
  opcionesCuenta: Opcion[]
  onListo: () => void
}) {
  const { pendiente: p, grupoId, nombre, cuentaGrupo, opcionesCategoria, opcionesCuenta, onListo } = props
  const [categoria, setCategoria] = useState<string | null>(leerCat(grupoId))
  const [cuenta, setCuenta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function registrar() {
    setBusy(true)
    setError(null)
    const err =
      p.tipo === 'gasto'
        ? await registrarGasto({ gasto: p.gasto, miParte: p.miParte, pague: p.pague, cuentaGrupo, categoriaId: categoria, cuentaPago: cuenta })
        : await registrarPago({
            pago: p.pago,
            pague: p.pague,
            cuentaGrupo,
            cuenta,
            nota: p.pague ? `Pago a ${nombre(p.pago.a_miembro)}` : `Pago de ${nombre(p.pago.de_miembro)}`,
          })
    setBusy(false)
    if (err) return setError(err)
    if (categoria) guardarCat(grupoId, categoria)
    onListo()
  }

  return (
    <div className="pendiente">
      {p.tipo === 'gasto' ? (
        <p>
          <strong>{p.gasto.descripcion}</strong>: {formatMonto(p.gasto.monto, p.gasto.moneda)}
          {p.miParte > 0 && `, tu parte ${formatMonto(p.miParte, p.gasto.moneda)}`}
          {p.pague && ', lo pagaste vos'}
        </p>
      ) : (
        <p>
          <strong>{p.pague ? `Le pagaste a ${nombre(p.pago.a_miembro)}` : `${nombre(p.pago.de_miembro)} te pagó`}</strong>{' '}
          {formatMonto(p.pago.monto, p.pago.moneda)}
        </p>
      )}
      {p.tipo === 'gasto' && p.miParte > 0 && (
        <Combobox etiqueta="Categoría de tu parte" opciones={opcionesCategoria} valor={categoria} onCambio={setCategoria} />
      )}
      {((p.tipo === 'gasto' && p.pague) || p.tipo === 'pago') && (
        <Combobox
          etiqueta={p.tipo === 'pago' && !p.pague ? 'Entró a' : 'Pagaste con'}
          opciones={opcionesCuenta}
          valor={cuenta}
          onCambio={setCuenta}
        />
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={registrar} disabled={busy}>
        {busy ? 'Registrando…' : 'Registrar'}
      </button>
    </div>
  )
}

function Saldar(props: {
  deuda: Deuda
  grupoId: string
  miMiembro: string
  nombre: (m: string) => string
  cuentaGrupo: string
  opcionesCuenta: Opcion[]
  onListo: () => void
  onCancelar: () => void
}) {
  const { deuda, grupoId, miMiembro, nombre, cuentaGrupo, opcionesCuenta, onListo, onCancelar } = props
  const pago = deuda.de === miMiembro
  const [montoTexto, setMontoTexto] = useState(montoAEditable(deuda.monto))
  const [cuenta, setCuenta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirmar() {
    const monto = parseMonto(montoTexto)
    if (!monto) return setError('Ingresá un monto válido.')
    if (!cuenta) return setError(pago ? 'Elegí de qué cuenta pagás.' : 'Elegí a qué cuenta entró la plata.')
    setBusy(true)
    setError(null)
    const fecha = hoyISO()
    const { data, error } = await supabase.rpc('registrar_pago_grupo', {
      p_grupo: grupoId,
      p_de: deuda.de,
      p_a: deuda.a,
      p_monto: monto,
      p_moneda: deuda.moneda,
      p_fecha: fecha,
    })
    if (error) {
      setBusy(false)
      return setError(error.message)
    }
    const err = await registrarPago({
      pago: { id: data as string, grupo_id: grupoId, de_miembro: deuda.de, a_miembro: deuda.a, monto, moneda: deuda.moneda, fecha, creado_por: '' },
      pague: pago,
      cuentaGrupo,
      cuenta,
      nota: pago ? `Pago a ${nombre(deuda.a)}` : `Pago de ${nombre(deuda.de)}`,
    })
    setBusy(false)
    if (err) return setError(err)
    onListo()
  }

  return (
    <section className="bloque formulario">
      <h2>{pago ? `Pagarle a ${nombre(deuda.a)}` : `${nombre(deuda.de)} te pagó`}</h2>
      <label>
        Monto ({deuda.moneda})
        <InputNumero value={montoTexto} onChange={setMontoTexto} />
      </label>
      <Combobox etiqueta={pago ? 'Pagás con' : 'Entró a'} opciones={opcionesCuenta} valor={cuenta} onCambio={setCuenta} />
      {error && <p className="error">{error}</p>}
      <button className="primary" onClick={confirmar} disabled={busy}>
        {busy ? 'Guardando…' : 'Confirmar pago'}
      </button>
      <button className="link" onClick={onCancelar}>
        Cancelar
      </button>
    </section>
  )
}
