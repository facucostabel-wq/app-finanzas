import { useState } from 'react'
import { Link } from 'react-router-dom'
import IconoCategoria from '../components/IconoCategoria'
import InputNumero from '../components/InputNumero'
import BarraPresupuesto from '../components/BarraPresupuesto'
import { useTiposHoy } from '../lib/cotizaciones'
import { useCategorias, useMovimientosDelMes, type Categoria } from '../lib/datos'
import { formatMonto, mesActual, montoAEditable, parseMonto, parseNumero, type Moneda } from '../lib/format'
import { usePerfil } from '../lib/perfil'
import {
  borrarPresupuesto,
  estadoPresupuestos,
  guardarPresupuesto,
  usePresupuestos,
  type Estado,
  type Presupuesto,
} from '../lib/presupuestos'

/** Presupuestos por categoría (y uno general), con cómo vienen este mes. */
export default function Presupuestos() {
  const { categorias } = useCategorias()
  const { presupuestos, falta, recargar } = usePresupuestos()
  const { movimientos } = useMovimientosDelMes(mesActual())
  const { perfil } = usePerfil()
  const monedas = perfil?.monedas_favoritas?.length ? perfil.monedas_favoritas : ['ARS']
  const tipos = useTiposHoy(['USD', ...presupuestos.map((p) => p.moneda), ...movimientos.map((m) => m.moneda)])
  const estados = estadoPresupuestos(presupuestos, movimientos, tipos)
  const estadoDe = (categoriaId: string | null) => estados.find((e) => e.presupuesto.categoria_id === categoriaId)
  const [abierto, setAbierto] = useState<string | null>(null)

  const deGasto = categorias.filter((c) => c.tipo === 'gasto' && c.activa)
  // Primero las que tienen presupuesto.
  const ordenadas = [...deGasto].sort((a, b) => Number(Boolean(estadoDe(b.id))) - Number(Boolean(estadoDe(a.id))))

  return (
    <main className="screen presupuestos-pantalla">
      <header className="topbar">
        <Link to="/" className="link">
          ← Resumen
        </Link>
      </header>
      <h1>Presupuestos</h1>
      <p className="muted">
        Un tope por mes para cada categoría que quieras, como monto fijo o como % de lo que ingresó en el mes. Cada mes
        arranca de cero. Cuentan todos los gastos de la categoría, también tu parte de los grupos y las cuotas que vencen.
      </p>
      {falta && <p className="error chico">Falta actualizar la base (SQL 0021) para guardar presupuestos.</p>}

      <ul className="presupuestos-lista">
        <Fila
          clave="general"
          titulo="General (todos los gastos)"
          icono={null}
          estado={estadoDe(null)}
          categoriaId={null}
          monedas={monedas}
          abierto={abierto === 'general'}
          onAbrir={() => setAbierto(abierto === 'general' ? null : 'general')}
          onListo={() => {
            setAbierto(null)
            recargar()
          }}
        />
        {ordenadas.map((c) => (
          <Fila
            key={c.id}
            clave={c.id}
            titulo={c.nombre}
            icono={c}
            estado={estadoDe(c.id)}
            categoriaId={c.id}
            monedas={monedas}
            abierto={abierto === c.id}
            onAbrir={() => setAbierto(abierto === c.id ? null : c.id)}
            onListo={() => {
              setAbierto(null)
              recargar()
            }}
          />
        ))}
      </ul>
    </main>
  )
}

function textoPresupuesto(p: Presupuesto) {
  return p.tipo === 'monto' ? formatMonto(p.monto ?? 0, p.moneda) : `${String(p.porcentaje).replace('.', ',')}% de lo que ingresó`
}

function Fila(props: {
  clave: string
  titulo: string
  icono: Categoria | null
  estado: Estado | undefined
  categoriaId: string | null
  monedas: Moneda[]
  abierto: boolean
  onAbrir: () => void
  onListo: () => void
}) {
  const { titulo, icono, estado, categoriaId, monedas, abierto, onAbrir, onListo } = props
  const p = estado?.presupuesto
  const [tipo, setTipo] = useState<'monto' | 'porcentaje'>(p?.tipo ?? 'monto')
  const [valor, setValor] = useState(
    p ? (p.tipo === 'monto' ? montoAEditable(p.monto ?? 0) : String(p.porcentaje).replace('.', ',')) : '',
  )
  const [moneda, setMoneda] = useState<Moneda>(p?.moneda ?? monedas[0])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function guardar() {
    setError(null)
    const n = tipo === 'monto' ? parseMonto(valor) : parseNumero(valor, 2)
    if (!n || n <= 0) return setError(tipo === 'monto' ? 'Ingresá un monto.' : 'Ingresá un porcentaje.')
    if (tipo === 'porcentaje' && n > 100) return setError('El porcentaje no puede pasar de 100.')
    setBusy(true)
    const err = await guardarPresupuesto({
      id: p?.id,
      categoria_id: categoriaId,
      tipo,
      monto: tipo === 'monto' ? n : null,
      porcentaje: tipo === 'porcentaje' ? n : null,
      moneda,
    })
    setBusy(false)
    if (err) return setError(`No se pudo guardar: ${err}`)
    onListo()
  }

  async function quitar() {
    if (!p) return
    setBusy(true)
    const err = await borrarPresupuesto(p.id)
    setBusy(false)
    if (err) return setError(`No se pudo quitar: ${err}`)
    setValor('')
    onListo()
  }

  return (
    <li className={`presupuesto-fila ${abierto ? 'abierta' : ''}`}>
      <button className="presupuesto-cabecera" onClick={onAbrir} aria-expanded={abierto}>
        {icono ? (
          <IconoCategoria nombre={icono.nombre} tipo="gasto" icono={icono.icono} />
        ) : (
          <span className="presupuesto-general" aria-hidden="true">
            Σ
          </span>
        )}
        <span className="presupuesto-texto">
          <span>{titulo}</span>
          <span className="muted chico">{p ? textoPresupuesto(p) : 'Sin presupuesto'}</span>
        </span>
        {estado && <BarraPresupuesto estado={estado} compacta />}
      </button>
      {abierto && (
        <div className="presupuesto-editor">
          <div className="segmentado chico" role="group" aria-label="Tipo de presupuesto">
            <button aria-pressed={tipo === 'monto'} onClick={() => setTipo('monto')}>
              Monto fijo
            </button>
            <button aria-pressed={tipo === 'porcentaje'} onClick={() => setTipo('porcentaje')}>
              % de ingresos
            </button>
          </div>
          <div className="presupuesto-valor">
            {tipo === 'monto' && monedas.length > 1 && (
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} aria-label="Moneda">
                {monedas.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            )}
            <InputNumero
              value={valor}
              onChange={setValor}
              decimales={2}
              placeholder={tipo === 'monto' ? '150.000' : '10'}
              aria-label={tipo === 'monto' ? 'Monto por mes' : 'Porcentaje de los ingresos'}
            />
            {tipo === 'porcentaje' && <span className="muted">%</span>}
          </div>
          {tipo === 'porcentaje' && (
            <p className="muted chico">Se calcula sobre lo que ingresó en el mes: si todavía no cobraste, el tope arranca en cero.</p>
          )}
          {error && <p className="error chico">{error}</p>}
          <div className="presupuesto-acciones">
            {p && (
              <button className="link peligro-texto" onClick={quitar} disabled={busy}>
                Quitar presupuesto
              </button>
            )}
            <button className="primary" onClick={guardar} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
