import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import Combobox from '../components/Combobox'
import { useAuth } from '../lib/auth'
import {
  TEXTO_TIPO_CUENTA,
  useCategorias,
  useCuentas,
  useSaldosCuentas,
  type Categoria,
  type TipoCategoria,
} from '../lib/datos'
import { formatMonto, hoyISO, mesActual } from '../lib/format'
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
  // Saldo actual de cada cuenta (no el inicial).
  const { saldos } = useSaldosCuentas(mesActual())
  const { cuentas } = useCuentas()
  const [fechaSaldo, setFechaSaldo] = useState('')
  const [okFecha, setOkFecha] = useState(false)
  const principales = cuentas.filter((c) => !c.cuenta_padre_id && c.tipo !== 'grupo')
  const saldosDe = (cuentaId: string) =>
    saldos
      .filter((x) => x.cuenta_id === cuentaId && Math.abs(x.monto) >= 0.01)
      .map((x) => formatMonto(Math.round(x.monto * 100) / 100, x.moneda))

  useEffect(() => {
    setFechaSaldo(perfil?.saldo_inicial_fecha ?? '')
  }, [perfil?.saldo_inicial_fecha])

  async function guardarFecha(valor: string) {
    setError(null)
    setOkFecha(false)
    const { error } = await supabase.from('perfiles').update({ saldo_inicial_fecha: valor || null }).eq('id', session!.user.id)
    if (error) return setError(`No se pudo guardar la fecha: ${error.message}`)
    await recargarPerfil()
    setOkFecha(true)
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
        <h2>Cuentas</h2>
        <p className="muted chico">Bancos, billeteras, efectivo y brokers, con sus saldos y tarjetas de crédito.</p>
        <ul className="lista">
          {principales.map((c) => {
            const hijas = cuentas.filter((x) => x.cuenta_padre_id === c.id)
            const montos = saldosDe(c.id)
            return (
              <li key={c.id}>
                <Link to={`/cuentas/${c.id}`} className={`fila cuenta-fila ${c.activa ? '' : 'inactiva'}`}>
                  <div>
                    <div>{c.nombre}</div>
                    <div className="muted chico">
                      {TEXTO_TIPO_CUENTA[c.tipo]}
                      {hijas.length > 0 && `, con ${hijas.map((h) => h.nombre).join(' y ')}`}
                      {!c.activa && ' (oculta)'}
                    </div>
                  </div>
                  <div className="cuenta-saldos chico">
                    {montos.map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                </Link>
              </li>
            )
          })}
          {principales.length === 0 && <li className="muted">Todavía no tenés cuentas.</li>}
        </ul>
        <Link to="/cuentas/nueva" className="primary boton">
          + Agregar cuenta
        </Link>
        <details className="detalle">
          <summary>Fecha de los saldos (opcional)</summary>
          <p className="muted chico">
            Si cargaste movimientos viejos que ya están reflejados en los saldos, poné desde qué día contar. Vacío =
            cuentan todos.
          </p>
          <div className="agregar">
            <input type="date" value={fechaSaldo} max={hoyISO()} onChange={(e) => setFechaSaldo(e.target.value)} />
            <button className="secundario" onClick={() => guardarFecha(fechaSaldo)}>
              Guardar
            </button>
          </div>
          {fechaSaldo && (
            <button className="link" onClick={() => { setFechaSaldo(''); guardarFecha('') }}>
              Quitar fecha
            </button>
          )}
          {okFecha && <p className="info">Fecha guardada.</p>}
        </details>
      </section>

      <section className="card">
        <h2>Monedas favoritas</h2>
        <p className="muted chico">Aparecen primero en la lista de monedas. La primera es la que viene elegida al cargar.</p>
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
