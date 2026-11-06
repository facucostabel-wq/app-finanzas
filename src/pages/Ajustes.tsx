import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import Combobox from '../components/Combobox'
import { useAuth } from '../lib/auth'
import { useCategorias, useSaldosIniciales, type Categoria, type TipoCategoria } from '../lib/datos'
import { hoyISO, montoAEditable, parseMonto } from '../lib/format'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

const TIPOS_CATEGORIA: [TipoCategoria, string][] = [
  ['gasto', 'Gastos'],
  ['ingreso', 'Ingresos'],
  ['inversion', 'Inversiones'],
]

export default function Ajustes() {
  const { session } = useAuth()
  const { perfil, recargar: recargarPerfil } = usePerfil()
  const { categorias, recargar } = useCategorias()
  const [tipo, setTipo] = useState<TipoCategoria>('gasto')
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const favoritas = perfil?.monedas_favoritas ?? []
  const { saldos, recargar: recargarSaldos } = useSaldosIniciales()
  const [fechaSaldo, setFechaSaldo] = useState('')
  const [textoSaldo, setTextoSaldo] = useState<Record<string, string>>({})
  const [guardandoSaldo, setGuardandoSaldo] = useState(false)
  const [okSaldo, setOkSaldo] = useState(false)
  const monedasSaldo = [...new Set([...favoritas, ...saldos.keys()])]

  // Precarga lo guardado.
  useEffect(() => {
    setFechaSaldo(perfil?.saldo_inicial_fecha ?? '')
  }, [perfil?.saldo_inicial_fecha])
  useEffect(() => {
    setTextoSaldo(Object.fromEntries([...saldos.entries()].map(([m, v]) => [m, montoAEditable(v)])))
  }, [saldos])

  async function guardarSaldo() {
    setError(null)
    setOkSaldo(false)
    const filas: { moneda: string; monto: number }[] = []
    const borrar: string[] = []
    for (const m of monedasSaldo) {
      const t = (textoSaldo[m] ?? '').trim()
      if (!t || t === '0') {
        borrar.push(m)
        continue
      }
      const v = parseMonto(t)
      if (!v) return setError(`El saldo de ${m} no es un número válido.`)
      filas.push({ moneda: m, monto: v })
    }
    setGuardandoSaldo(true)
    const r1 = await supabase.from('perfiles').update({ saldo_inicial_fecha: fechaSaldo || null }).eq('id', session!.user.id)
    const r2 = filas.length
      ? await supabase.from('saldos_iniciales').upsert(filas, { onConflict: 'usuario_id,moneda' })
      : { error: null }
    const r3 = borrar.length ? await supabase.from('saldos_iniciales').delete().in('moneda', borrar) : { error: null }
    setGuardandoSaldo(false)
    const err = r1.error ?? r2.error ?? r3.error
    if (err) return setError(`No se pudo guardar el saldo inicial: ${err.message}`)
    await Promise.all([recargarSaldos(), recargarPerfil()])
    setOkSaldo(true)
  }

  async function guardarFavoritas(lista: string[]) {
    setError(null)
    const { error } = await supabase
      .from('perfiles')
      .update({ monedas_favoritas: lista })
      .eq('id', session!.user.id)
    if (error) setError(`No se pudieron guardar las monedas: ${error.message}`)
    await recargarPerfil()
  }

  function mover(i: number, delta: number) {
    const lista = [...favoritas]
    const j = i + delta
    if (j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    guardarFavoritas(lista)
  }

  async function crearCategoria() {
    const nombre = nueva.trim()
    if (!nombre) return
    setError(null)
    const { error } = await supabase.from('categorias').insert({ tipo, nombre })
    if (error) setError(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : error.message)
    else setNueva('')
    recargar()
  }

  async function actualizar(c: Categoria, cambios: Partial<Categoria>) {
    setError(null)
    const { error } = await supabase.from('categorias').update(cambios).eq('id', c.id)
    if (error) setError(error.code === '23505' ? 'Ya existe una categoría con ese nombre.' : error.message)
    recargar()
  }

  function renombrar(c: Categoria) {
    const nombre = window.prompt('Nuevo nombre', c.nombre)?.trim()
    if (nombre && nombre !== c.nombre) actualizar(c, { nombre })
  }

  const delTipo = categorias.filter((c) => c.tipo === tipo)

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <h1>Ajustes</h1>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Saldo inicial</h2>
        <p className="muted chico">
          Cuánta plata para gastar tenías (sin contar inversiones) antes de tu primer movimiento cargado. El dinero
          disponible del resumen arranca desde acá.
        </p>
        <label>
          Desde (opcional)
          <input type="date" value={fechaSaldo} max={hoyISO()} onChange={(e) => setFechaSaldo(e.target.value)} />
          <small className="muted">
            Dejalo vacío para que cuenten todos tus movimientos. Si ponés una fecha, los movimientos anteriores a ese
            día no suman (sirve si cargaste gastos viejos que ya están reflejados en el saldo).
          </small>
        </label>
        {fechaSaldo && (
          <button className="link" onClick={() => setFechaSaldo('')}>
            Quitar fecha
          </button>
        )}
        {monedasSaldo.map((m) => (
          <label key={m}>
            {m} <span className="muted chico">{nombreMoneda(m)}</span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={textoSaldo[m] ?? ''}
              onChange={(e) => {
                setOkSaldo(false)
                setTextoSaldo({ ...textoSaldo, [m]: e.target.value })
              }}
            />
          </label>
        ))}
        {okSaldo && <p className="info">Saldo inicial guardado.</p>}
        <button className="primary" onClick={guardarSaldo} disabled={guardandoSaldo}>
          {guardandoSaldo ? 'Guardando…' : 'Guardar saldo inicial'}
        </button>
      </section>

      <section className="card">
        <h2>Monedas favoritas</h2>
        <p className="muted chico">Aparecen como botones al cargar. La primera es la que viene marcada.</p>
        <ul className="lista">
          {favoritas.map((m, i) => (
            <li key={m} className="fila">
              <div>
                <strong>{m}</strong> <span className="muted">{nombreMoneda(m)}</span>
              </div>
              <div className="acciones">
                <button className="icono" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${m}`}>
                  ↑
                </button>
                <button
                  className="icono"
                  onClick={() => mover(i, 1)}
                  disabled={i === favoritas.length - 1}
                  aria-label={`Bajar ${m}`}
                >
                  ↓
                </button>
                <button
                  className="icono"
                  onClick={() => guardarFavoritas(favoritas.filter((x) => x !== m))}
                  disabled={favoritas.length === 1}
                  aria-label={`Quitar ${m}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
        {favoritas.length < 10 && (
          <Combobox
            etiqueta="Agregar moneda"
            opciones={MONEDAS.filter((m) => !favoritas.includes(m.codigo)).map((m) => ({
              valor: m.codigo,
              texto: m.codigo,
              detalle: m.nombre,
            }))}
            valor={null}
            onCambio={(c) => guardarFavoritas([...favoritas, c])}
            placeholder="Buscar: real, BRL, libra…"
          />
        )}
      </section>

      <section className="card">
        <h2>Categorías</h2>
        <div className="segmentado chico" role="group" aria-label="Tipo de categoría">
          {TIPOS_CATEGORIA.map(([v, t]) => (
            <button key={v} aria-pressed={tipo === v} onClick={() => setTipo(v)}>
              {t}
            </button>
          ))}
        </div>
        <ul className="lista">
          {delTipo.map((c) => (
            <li key={c.id} className={`fila ${c.activa ? '' : 'inactiva'}`}>
              <button className="link-texto" onClick={() => renombrar(c)} aria-label={`Renombrar ${c.nombre}`}>
                {c.nombre}
              </button>
              <label className="interruptor">
                <input
                  type="checkbox"
                  checked={c.activa}
                  onChange={(e) => actualizar(c, { activa: e.target.checked })}
                  aria-label={`${c.activa ? 'Desactivar' : 'Activar'} ${c.nombre}`}
                />
                <span>{c.activa ? 'Activa' : 'Oculta'}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="agregar">
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            maxLength={40}
            placeholder="Nueva categoría"
            aria-label="Nombre de la nueva categoría"
          />
          <button className="primary" onClick={crearCategoria} disabled={!nueva.trim()}>
            Agregar
          </button>
        </div>
        <p className="muted chico">Tocá un nombre para renombrarlo. Ocultar una categoría no borra sus movimientos.</p>
      </section>

      <section className="card">
        <h2>Cuenta</h2>
        <p className="muted">{session?.user.email}</p>
        <Link to="/privacidad">Política de privacidad</Link>
        <button className="secundario" onClick={() => supabase.auth.signOut()}>
          Cerrar sesión
        </button>
      </section>

      <BottomNav />
    </main>
  )
}
