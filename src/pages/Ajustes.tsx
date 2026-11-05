import { useState } from 'react'
import { Link } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SelectorMoneda from '../components/SelectorMoneda'
import { useAuth } from '../lib/auth'
import { useCategorias, type Categoria, type TipoCategoria } from '../lib/datos'
import { nombreMoneda } from '../lib/monedas'
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
  const [agregandoMoneda, setAgregandoMoneda] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const favoritas = perfil?.monedas_favoritas ?? []

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
          <button className="link" onClick={() => setAgregandoMoneda(true)}>
            + Agregar moneda
          </button>
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

      {agregandoMoneda && (
        <SelectorMoneda
          excluir={favoritas}
          onElegir={(c) => {
            setAgregandoMoneda(false)
            guardarFavoritas([...favoritas, c])
          }}
          onCerrar={() => setAgregandoMoneda(false)}
        />
      )}
      <BottomNav />
    </main>
  )
}
