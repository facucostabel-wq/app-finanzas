import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Combobox, { type Opcion } from '../components/Combobox'
import { useAuth } from '../lib/auth'
import { nombreCuenta, TEXTO_TIPO_CUENTA, useCategorias, useCuentas } from '../lib/datos'
import { formatMonto, hoyISO, montoAEditable, parseMonto, parseNumero } from '../lib/format'
import { dividirIguales, registrarGasto, useGrupo, type GastoGrupo } from '../lib/grupos'
import { MONEDAS } from '../lib/monedas'
import { supabase } from '../lib/supabase'

type Modo = 'iguales' | 'montos' | 'porcentajes'

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

/** Alta y edición de un gasto del grupo, con su división y lo que me toca a mí. */
export default function GastoGrupoForm() {
  const { id: grupoId, gastoId } = useParams()
  const editando = Boolean(gastoId && gastoId !== 'nuevo')
  const navigate = useNavigate()
  const { session } = useAuth()
  const { grupo, miembros, gastos, divisiones, cuentaGrupo, miMiembro, loading } = useGrupo(grupoId)
  const { categorias } = useCategorias()
  const { cuentas } = useCuentas()

  const [descripcion, setDescripcion] = useState('')
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [fecha, setFecha] = useState(hoyISO())
  const [pagador, setPagador] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('iguales')
  const [incluidos, setIncluidos] = useState<string[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [categoria, setCategoria] = useState<string | null>(grupoId ? leerCat(grupoId) : null)
  const [cuentaPago, setCuentaPago] = useState<string | null>(null)
  const [listo, setListo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const existente: GastoGrupo | undefined = gastos.find((g) => g.id === gastoId)
  const puedoEditar = !editando || existente?.creado_por === session?.user.id

  // Precarga: valores por defecto (nuevo) o los del gasto (edición).
  useEffect(() => {
    if (loading || listo || !grupo) return
    if (editando && existente) {
      setDescripcion(existente.descripcion)
      setMontoTexto(montoAEditable(existente.monto))
      setMoneda(existente.moneda)
      setFecha(existente.fecha)
      setPagador(existente.pagado_por)
      setModo(existente.modo)
      const divs = divisiones.filter((d) => d.gasto_id === existente.id)
      setIncluidos(divs.map((d) => d.miembro_id))
      if (existente.modo === 'montos') setValores(Object.fromEntries(divs.map((d) => [d.miembro_id, montoAEditable(d.monto)])))
      if (existente.modo === 'porcentajes')
        setValores(Object.fromEntries(divs.map((d) => [d.miembro_id, montoAEditable(Math.round((d.monto / existente.monto) * 10000) / 100)])))
    } else {
      setMoneda(grupo.moneda)
      setPagador(miMiembro)
      setIncluidos(miembros.map((m) => m.id))
    }
    setListo(true)
  }, [loading, listo, grupo, editando, existente, divisiones, miembros, miMiembro])

  const monto = parseMonto(montoTexto)

  // División calculada según el modo.
  const division: { miembro_id: string; monto: number }[] = (() => {
    if (!monto) return []
    if (modo === 'iguales') {
      const partes = dividirIguales(monto, Math.max(incluidos.length, 1))
      return incluidos.map((m, i) => ({ miembro_id: m, monto: partes[i] }))
    }
    return miembros
      .map((m) => {
        const v = parseNumero(valores[m.id] ?? '', 2) ?? 0
        return { miembro_id: m.id, monto: modo === 'montos' ? Math.round(v * 100) / 100 : Math.round(((monto * v) / 100) * 100) / 100 }
      })
      .filter((d) => d.monto > 0)
  })()
  const sumaDivision = Math.round(division.reduce((a, d) => a + d.monto, 0) * 100) / 100
  const diferencia = monto ? Math.round((monto - sumaDivision) * 100) / 100 : 0
  const miParte = division.find((d) => d.miembro_id === miMiembro)?.monto ?? 0
  const pague = pagador === miMiembro

  const opcionesCategoria: Opcion[] = categorias.filter((c) => c.tipo === 'gasto' && c.activa).map((c) => ({ valor: c.id, texto: c.nombre }))
  const opcionesCuenta: Opcion[] = cuentas
    .filter((c) => c.activa && c.tipo !== 'grupo')
    .map((c) => ({ valor: c.id, texto: nombreCuenta(c), detalle: TEXTO_TIPO_CUENTA[c.tipo] }))

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!descripcion.trim()) return setError('Poné una descripción (ej.: Cena del sábado).')
    if (!monto) return setError('Ingresá un monto válido.')
    if (!pagador) return setError('Elegí quién pagó.')
    if (!division.length) return setError('Elegí entre quiénes se divide.')
    if (Math.abs(diferencia) > 0.01) return setError(`La división no suma el total: faltan ${formatMonto(diferencia, moneda)}.`)
    if (miParte > 0 && !categoria) return setError('Elegí la categoría de tu parte.')
    if (pague && !cuentaPago) return setError('Elegí con qué cuenta pagaste.')
    if (!cuentaGrupo || !grupoId) return setError('No se encontró tu cuenta del grupo.')

    setBusy(true)
    const { data, error } = await supabase.rpc('guardar_gasto_grupo', {
      p_id: editando ? gastoId : null,
      p_grupo: grupoId,
      p_descripcion: descripcion.trim(),
      p_fecha: fecha,
      p_monto: monto,
      p_moneda: moneda,
      p_pagado_por: pagador,
      p_modo: modo,
      p_divisiones: division,
    })
    if (error) {
      setBusy(false)
      return setError(error.message)
    }
    // Lo mío se registra en el momento (los demás lo confirman desde el grupo).
    const err = await registrarGasto({
      gasto: { id: data as string, grupo_id: grupoId, descripcion: descripcion.trim(), fecha, monto, moneda, pagado_por: pagador, modo, creado_por: '' },
      miParte,
      pague,
      cuentaGrupo,
      categoriaId: categoria,
      cuentaPago,
    })
    setBusy(false)
    if (err) return setError(`El gasto del grupo se guardó, pero no tu parte: ${err}`)
    if (categoria) guardarCat(grupoId, categoria)
    navigate(`/grupos/${grupoId}`)
  }

  async function borrar() {
    if (!gastoId || !window.confirm('¿Borrar este gasto del grupo? Se borra para todos.')) return
    setBusy(true)
    await supabase.from('movimientos').delete().eq('gasto_grupo_id', gastoId) // lo mío
    const { error } = await supabase.from('gastos_grupo').delete().eq('id', gastoId)
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/grupos/${grupoId}`)
  }

  if (loading || !listo) return <main className="screen center muted">Cargando…</main>

  const nombre = (m: string) => (m === miMiembro ? 'Vos' : (miembros.find((x) => x.id === m)?.nombre ?? '—'))

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate(`/grupos/${grupoId}`)}>
          ← {grupo?.nombre}
        </button>
      </header>
      <h1 className="titulo-chico">{editando ? (puedoEditar ? 'Editar gasto' : 'Gasto del grupo') : 'Nuevo gasto del grupo'}</h1>

      <form className="card formulario" onSubmit={guardar} style={{ marginTop: 12 }}>
        {!puedoEditar && <p className="aviso">Solo quien lo cargó puede editarlo.</p>}
        <fieldset disabled={!puedoEditar} className="sin-borde">
          <label>
            Descripción
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={80} placeholder="Ej.: Cena del sábado" />
          </label>
          <label>
            Monto total
            <input className="monto-input" inputMode="decimal" placeholder="0" value={montoTexto} onChange={(e) => setMontoTexto(e.target.value)} />
          </label>
          <Combobox
            etiqueta="Moneda"
            opciones={MONEDAS.map((m) => ({ valor: m.codigo, texto: m.codigo, detalle: m.nombre }))}
            valor={moneda}
            onCambio={setMoneda}
          />
          <label>
            Fecha
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>

          <div className="grupo">
            <span className="grupo-titulo">¿Quién pagó?</span>
            <div className="chips">
              {miembros.map((m) => (
                <button type="button" key={m.id} className="chip" aria-pressed={pagador === m.id} onClick={() => setPagador(m.id)}>
                  {nombre(m.id)}
                </button>
              ))}
            </div>
          </div>

          <div className="grupo">
            <span className="grupo-titulo">¿Cómo se divide?</span>
            <div className="segmentado chico" role="group" aria-label="Modo de división">
              {(
                [
                  ['iguales', 'Iguales'],
                  ['montos', 'Montos'],
                  ['porcentajes', '%'],
                ] as [Modo, string][]
              ).map(([v, t]) => (
                <button type="button" key={v} aria-pressed={modo === v} onClick={() => setModo(v)}>
                  {t}
                </button>
              ))}
            </div>
            <ul className="division">
              {miembros.map((m) => {
                const parte = division.find((d) => d.miembro_id === m.id)?.monto ?? 0
                return (
                  <li key={m.id}>
                    {modo === 'iguales' ? (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={incluidos.includes(m.id)}
                          onChange={(e) =>
                            setIncluidos(e.target.checked ? [...incluidos, m.id] : incluidos.filter((x) => x !== m.id))
                          }
                        />
                        <span>{nombre(m.id)}</span>
                      </label>
                    ) : (
                      <span>{nombre(m.id)}</span>
                    )}
                    {modo === 'iguales' ? (
                      <span className="muted">{parte ? formatMonto(parte, moneda) : '—'}</span>
                    ) : (
                      <input
                        inputMode="decimal"
                        className="division-input"
                        placeholder="0"
                        value={valores[m.id] ?? ''}
                        onChange={(e) => setValores({ ...valores, [m.id]: e.target.value })}
                        aria-label={`${modo === 'montos' ? 'Monto' : 'Porcentaje'} de ${nombre(m.id)}`}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
            {monto && Math.abs(diferencia) > 0.01 && (
              <p className="error chico">
                {diferencia > 0 ? `Faltan ${formatMonto(diferencia, moneda)}` : `Sobran ${formatMonto(-diferencia, moneda)}`}
              </p>
            )}
          </div>

          {(miParte > 0 || pague) && puedoEditar && (
            <div className="grupo mi-parte">
              <span className="grupo-titulo">En tus finanzas</span>
              {miParte > 0 && (
                <Combobox
                  etiqueta={`Categoría de tu parte (${formatMonto(miParte, moneda)})`}
                  opciones={opcionesCategoria}
                  valor={categoria}
                  onCambio={setCategoria}
                />
              )}
              {pague && (
                <Combobox
                  etiqueta={`Pagaste con (${monto ? formatMonto(monto, moneda) : 'el total'})`}
                  opciones={opcionesCuenta}
                  valor={cuentaPago}
                  onCambio={setCuentaPago}
                />
              )}
              <small className="muted">
                {pague
                  ? 'Sale el total de tu cuenta; tu parte cuenta como gasto y el resto queda como plata que te deben.'
                  : 'Tu parte cuenta como gasto; lo que debés no toca tu disponible hasta que pagues.'}
              </small>
            </div>
          )}
        </fieldset>

        {error && <p className="error">{error}</p>}
        {puedoEditar && (
          <button className="primary" disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar gasto'}
          </button>
        )}
        {editando && puedoEditar && (
          <button type="button" className="peligro" onClick={borrar} disabled={busy}>
            Borrar gasto
          </button>
        )}
      </form>
    </main>
  )
}
