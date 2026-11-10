import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import Combobox from '../components/Combobox'
import MiCuenta from '../components/MiCuenta'
import IconoCategoria from '../components/IconoCategoria'
import SelectorIcono from '../components/SelectorIcono'
import AvisoPush from '../components/AvisoPush'
import { desactivarPush } from '../lib/push'
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
  const { seccion } = useParams()
  const { session } = useAuth()
  const { perfil, recargar: recargarPerfil } = usePerfil()
  const { categorias, recargar } = useCategorias()
  const [tipo, setTipo] = useState<TipoCategoria>('gasto')
  const [nueva, setNueva] = useState('')
  const [eligiendo, setEligiendo] = useState<Categoria | null>(null)
  const [error, setError] = useState<string | null>(null)
  const favoritas = perfil?.monedas_favoritas ?? []
  // Saldo actual de cada cuenta (no el inicial).
  const { saldos } = useSaldosCuentas(mesActual())
  const { cuentas, error: errorCuentas } = useCuentas()
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

  const titulos: Record<string, string> = {
    cuentas: 'Cuentas',
    monedas: 'Monedas favoritas',
    categorias: 'Categorías',
    notificaciones: 'Notificaciones',
    cuenta: 'Mi cuenta',
  }
  const titulo = seccion ? titulos[seccion] : undefined

  if (!seccion || !titulo) {
    const activas = categorias.filter((c) => c.activa).length
    return (
      <main className="screen con-nav">
        <header className="topbar">
          <h1>Ajustes</h1>
        </header>
        {errorCuentas && <p className="error">No se pudieron cargar las cuentas: {errorCuentas}</p>}
        <nav className="menu card" aria-label="Secciones de ajustes">
          <ItemMenu a="cuentas" titulo="Cuentas" detalle={principales.length === 1 ? '1 cuenta' : `${principales.length} cuentas`} icono="M3 7h18v12H3zM3 11h18M7 15h3" />
          <ItemMenu a="monedas" titulo="Monedas favoritas" detalle={favoritas.join(', ')} icono="M12 3v18M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.2-4.5 3.2c0 4.6 9 2.3 9 7 0 2-2 3.3-4.5 3.3s-4.5-1.1-4.5-3" />
          <ItemMenu a="categorias" titulo="Categorías" detalle={`${activas} activas`} icono="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
          <ItemMenu a="notificaciones" titulo="Notificaciones" detalle="Avisos de tus grupos" icono="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
          <ItemMenu a="cuenta" titulo="Mi cuenta" detalle={session?.user.email ?? ''} icono="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </nav>
        <CompartirApp />
        <button
          className="secundario boton-ancho"
          onClick={async () => {
            // Este dispositivo deja de recibir avisos de esta cuenta.
            await desactivarPush()
            await supabase.auth.signOut()
          }}
        >
          Cerrar sesión
        </button>
        <BottomNav />
      </main>
    )
  }

  return (
    <main className="screen con-nav">
      <header className="subpagina">
        <Link to="/ajustes" className="volver" aria-label="Volver a Ajustes">
          ‹ Ajustes
        </Link>
        <h1>{titulo}</h1>
      </header>

      {error && <p className="error">{error}</p>}
      {errorCuentas && seccion === 'cuentas' && <p className="error">No se pudieron cargar las cuentas: {errorCuentas}</p>}

      {seccion === 'cuentas' && (
        <>
      <section className="card">
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
        </>
      )}
      {seccion === 'monedas' && (
        <>
      <section className="card">
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
        </>
      )}
      {seccion === 'categorias' && (
        <>
      <section className="card">
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
              <button className="boton-icono-cat" onClick={() => setEligiendo(c)} aria-label={`Cambiar el ícono de ${c.nombre}`}>
                <IconoCategoria nombre={c.nombre} tipo={c.tipo} icono={c.icono} />
              </button>
              <button className="link-texto nombre-cat" onClick={() => renombrar(c)} aria-label={`Renombrar ${c.nombre}`}>
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
        <p className="muted chico">
          Tocá el ícono para cambiarlo y el nombre para renombrarla. Ocultar una categoría no borra sus movimientos.
        </p>
        {eligiendo && (
          <SelectorIcono
            categoria={eligiendo}
            onElegir={(icono) => {
              actualizar(eligiendo, { icono })
              setEligiendo(null)
            }}
            onCerrar={() => setEligiendo(null)}
          />
        )}
      </section>
        </>
      )}
      {seccion === 'notificaciones' && (
        <>
      <section className="card">
        <h2>En este dispositivo</h2>
        <p className="muted chico">Las notificaciones push llegan al celular aunque la app esté cerrada. Se activan en cada dispositivo.</p>
        <AvisoPush />
      </section>
      <PreferenciasAvisos />
        </>
      )}
      {seccion === 'cuenta' && (
        <>
      <MiCuenta />
        </>
      )}
      <BottomNav />
    </main>
  )
}

function ItemMenu({ a, titulo, detalle, icono }: { a: string; titulo: string; detalle: string; icono: string }) {
  return (
    <Link to={`/ajustes/${a}`} className="menu-item">
      <span className="menu-icono" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={icono} />
        </svg>
      </span>
      <span className="menu-texto">
        <span>{titulo}</span>
        {detalle && <span className="muted chico">{detalle}</span>}
      </span>
      <span className="menu-flecha" aria-hidden="true">›</span>
    </Link>
  )
}

const AVISOS: { tipo: string; titulo: string; detalle: string }[] = [
  { tipo: 'gasto_nuevo', titulo: 'Gasto nuevo', detalle: 'Alguien cargó un gasto en el que tenés parte' },
  { tipo: 'gasto_cambio', titulo: 'Gasto editado o borrado', detalle: 'Cambió o se borró un gasto en el que tenés parte' },
  { tipo: 'pago', titulo: 'Pago registrado', detalle: 'Alguien registró un pago con vos' },
  { tipo: 'union', titulo: 'Alguien se unió', detalle: 'Una persona nueva entró a uno de tus grupos' },
]

/** Qué avisos recibir (vale para el aviso dentro de la app y para el push). */
function PreferenciasAvisos() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [apagados, setApagados] = useState<string[] | null>(null)
  const [falta, setFalta] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    supabase
      .from('perfiles')
      .select('avisos_off')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setFalta(true)
        else setApagados((data?.avisos_off as string[] | undefined) ?? [])
      })
  }, [uid])

  async function cambiar(tipo: string, prendido: boolean) {
    if (!apagados || !uid) return
    const nuevos = prendido ? apagados.filter((t) => t !== tipo) : [...apagados, tipo]
    setApagados(nuevos)
    setError(null)
    const { error } = await supabase.from('perfiles').update({ avisos_off: nuevos }).eq('id', uid)
    if (error) {
      setError(`No se pudo guardar: ${error.message}`)
      setApagados(apagados)
    }
  }

  return (
    <section className="card">
      <h2>Qué te avisamos</h2>
      <p className="muted chico">Vale para el numerito en Grupos y para el push. Lo que hacés vos nunca te lo avisa.</p>
      {falta ? (
        <p className="muted">Falta ejecutar el SQL de notificaciones en Supabase.</p>
      ) : (
        <ul className="lista">
          {AVISOS.map((a) => {
            const prendido = !apagados?.includes(a.tipo)
            return (
              <li key={a.tipo} className="fila">
                <div>
                  <div>{a.titulo}</div>
                  <div className="muted chico">{a.detalle}</div>
                </div>
                <label className="interruptor">
                  <input
                    type="checkbox"
                    checked={prendido}
                    disabled={!apagados}
                    onChange={(e) => cambiar(a.tipo, e.target.checked)}
                    aria-label={`${prendido ? 'Apagar' : 'Prender'} aviso: ${a.titulo}`}
                  />
                  <span>{prendido ? 'Sí' : 'No'}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

/** Comparte el link de la app (menú de compartir del celular o, si no hay, copia el link). */
function CompartirApp() {
  const [copiado, setCopiado] = useState(false)
  const url = window.location.origin
  async function compartir() {
    const datos = {
      title: 'Finanzas',
      text: 'Te paso la app que uso para anotar gastos e inversiones y dividir gastos con amigos:',
      url,
    }
    try {
      if (navigator.share) return await navigator.share(datos)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      window.prompt('Copiá el link de la app:', url)
    }
  }
  return (
    <>
      <button className="primary boton-ancho compartir-app" onClick={compartir}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
        </svg>
        Compartir la app
      </button>
      {copiado && (
        <p className="info chico" role="status">
          Link copiado: {url}
        </p>
      )}
    </>
  )
}
