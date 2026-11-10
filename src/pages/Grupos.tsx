import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import Combobox from '../components/Combobox'
import { formatMonto } from '../lib/format'
import { useGrupos } from '../lib/grupos'
import { MONEDAS } from '../lib/monedas'
import { useCuentas, useSaldosCuentas } from '../lib/datos'
import { mesActual } from '../lib/format'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'
import AvisoPush from '../components/AvisoPush'
import { marcarLeidas, useNoLeidas } from '../lib/push'

export default function Grupos() {
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { grupos, loading } = useGrupos()
  const { cuentas } = useCuentas()
  const { saldos } = useSaldosCuentas(mesActual())
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [moneda, setMoneda] = useState(perfil?.monedas_favoritas?.[0] ?? 'ARS')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { items: novedades } = useNoLeidas()

  // Mi posición en cada grupo = saldo de mi cuenta personal de ese grupo (lo registrado).
  const posicion = (grupoId: string) => {
    const c = cuentas.find((x) => x.grupo_id === grupoId)
    return c ? saldos.filter((s) => s.cuenta_id === c.id && Math.abs(s.monto) >= 0.01) : []
  }

  async function crear() {
    if (!nombre.trim()) return setError('Poné un nombre al grupo.')
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('crear_grupo', { p_nombre: nombre.trim(), p_moneda: moneda })
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/grupos/${data}`)
  }

  return (
    <main className="screen con-nav">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Grupos</h1>
        </div>
      </header>
      <p className="muted chico">
        Gastos compartidos con amigos, pareja o viajes. Cada uno ve lo del grupo; tus finanzas personales siguen siendo
        solo tuyas.
      </p>

      {novedades.length > 0 && (
        <section className="novedades" aria-labelledby="novedades-titulo">
          <div className="novedades-cabecera">
            <h2 id="novedades-titulo">Novedades</h2>
            <button type="button" className="link-discreto" onClick={() => marcarLeidas()}>
              Marcar como leídas
            </button>
          </div>
          <ul className="lista card">
            {novedades.slice(0, 8).map((n) => (
              <li key={n.id}>
                <Link to={n.url} className="fila novedad">
                  <span className="novedad-punto" aria-hidden="true" />
                  <span className="novedad-texto">
                    <span className="chico muted">
                      {n.titulo} · {hace(n.creado_at)}
                    </span>
                    <span>{n.texto}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AvisoPush compacto />

      {loading ? (
        <p className="muted">Cargando…</p>
      ) : (
        <ul className="lista card">
          {grupos.map((g) => {
            const pos = posicion(g.id)
            return (
              <li key={g.id}>
                <Link to={`/grupos/${g.id}`} className="fila">
                  <span>{g.nombre}</span>
                  <span className="cuentas-montos chico">
                    {pos.length === 0 ? (
                      <span className="muted">Al día</span>
                    ) : (
                      pos.map((s) => (
                        <span key={s.moneda} className={s.monto < 0 ? 'negativo' : 'positivo'}>
                          {s.monto < 0 ? 'Debés ' : 'Te deben '}
                          {formatMonto(Math.abs(Math.round(s.monto * 100) / 100), s.moneda)}
                        </span>
                      ))
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
          {grupos.length === 0 && <li className="muted fila">Todavía no estás en ningún grupo.</li>}
        </ul>
      )}

      {creando ? (
        <section className="card formulario" style={{ marginTop: 14 }}>
          <label>
            Nombre del grupo
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Ej.: Viaje a Bariloche" autoFocus />
          </label>
          <Combobox
            etiqueta="Moneda principal"
            opciones={MONEDAS.map((m) => ({ valor: m.codigo, texto: m.codigo, detalle: m.nombre }))}
            valor={moneda}
            onCambio={setMoneda}
          />
          {error && <p className="error">{error}</p>}
          <button className="primary" onClick={crear} disabled={busy}>
            {busy ? 'Creando…' : 'Crear grupo'}
          </button>
          <button className="link" onClick={() => setCreando(false)}>
            Cancelar
          </button>
        </section>
      ) : (
        <button className="primary boton-ancho" onClick={() => setCreando(true)}>
          + Nuevo grupo
        </button>
      )}
      <BottomNav />
    </main>
  )
}

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}
