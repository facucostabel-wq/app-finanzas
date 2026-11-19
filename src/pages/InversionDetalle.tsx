import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { X } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import Combobox, { type Opcion } from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import InputNumero from '../components/InputNumero'
import { guardarValuacion } from '../lib/cartera'
import { formatCantidad, formatMonto, formatPrecio, parseNumero } from '../lib/format'
import { BotonOjo, Oculto } from '../lib/ocultar'
import { usePerfil } from '../lib/perfil'
import { calcularTenencias } from '../lib/tenencias'
import { useCartera } from '../lib/useCartera'
import { textoFuente } from './Inversiones'

const usd = (n: number) => formatMonto(Math.round(n * 100) / 100, 'USD')
const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1).replace('.', ',')}%`
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Detalle de una inversión: valor, resultado, sus movimientos y "Actualizar valor". */
export default function InversionDetalle() {
  const { clave: claveUrl } = useParams()
  const clave = decodeURIComponent(claveUrl ?? '')
  const { perfil } = usePerfil()
  const { posiciones, categorias, loading, faltaSql, recargarValuaciones } = useCartera()
  const [hoja, setHoja] = useState(false)
  const [modo, setModo] = useState<'total' | 'precio'>('total')
  const [valorTexto, setValorTexto] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const p = posiciones.find((x) => x.clave === clave)
  if (loading) return <main className="screen"><p className="muted">Cargando…</p></main>
  if (!p)
    return (
      <main className="screen">
        <p className="muted">No se encontró la inversión.</p>
        <Link to="/inversiones">Volver a inversiones</Link>
      </main>
    )

  const categoria = categorias.find((c) => c.id === p.categoria_id)
  // Precio promedio en la moneda en que se compró (puede haber más de una).
  const enOriginal = calcularTenencias(p.movimientos).filter((t) => t.cantidad > 0)
  const favoritas = perfil?.monedas_favoritas ?? ['ARS', 'USD']
  const opcionesMoneda: Opcion[] = [...new Set(['USD', 'ARS', ...favoritas])].map((m) => ({ valor: m, texto: m }))
  const abierta = p.cantidad > 0 || (p.porMonto && p.costoUsd > 0.005)

  function abrir() {
    setModo(p!.cantidad > 0 && !p!.porMonto ? 'precio' : 'total')
    setValorTexto('')
    setMoneda('USD')
    setError(null)
    setHoja(true)
  }

  async function guardar() {
    const v = parseNumero(valorTexto, 8)
    if (v === null || v < 0) return setError('Poné un valor válido.')
    setBusy(true)
    const e = await guardarValuacion({
      clave,
      precio: modo === 'precio' ? v : null,
      total: modo === 'total' ? Math.round(v * 100) / 100 : null,
      moneda,
    })
    setBusy(false)
    if (e) return setError(/relation|does not exist|schema cache/i.test(e) ? 'Falta ejecutar el SQL de valuaciones en Supabase.' : e)
    setHoja(false)
    recargarValuaciones()
  }

  const vista = parseNumero(valorTexto, 8)
  const totalVista = vista !== null ? (modo === 'precio' ? vista * p.cantidad : vista) : null

  return (
    <main className="screen con-nav">
      <header className="subpagina">
        <div className="subpagina-fila">
          <Link to="/inversiones" className="volver">
            ‹ Inversiones
          </Link>
          <BotonOjo className="ojo-suelto" />
        </div>
      </header>

      <section className="objetivo-hero">
        <IconoCategoria nombre={p.nombre} tipo="aporte" />
        <h1>{p.nombre}</h1>
        <p className="muted chico">{categoria?.nombre}</p>
        {abierta ? (
          <>
            <p className="objetivo-cifra">
              <strong>
                <Oculto>{usd(p.valorUsd)}</Oculto>
              </strong>
            </p>
            {p.porcentaje !== null && (
              <p className={p.resultadoUsd < 0 ? 'negativo' : 'positivo'}>
                <Oculto>{`${p.resultadoUsd >= 0 ? '+' : '−'}${usd(Math.abs(p.resultadoUsd))}`}</Oculto> ({pct(p.porcentaje)})
              </p>
            )}
            <p className={`chico ${p.fuente === 'costo' ? 'sin-valor' : 'muted'}`}>
              {p.fuente === 'costo' ? 'Sin valor actualizado: cuenta por lo que pagaste.' : `Valor ${textoFuente(p)}.`}
            </p>
          </>
        ) : (
          <p className="muted">Ya no tenés esta inversión.</p>
        )}
        {abierta && p.fuente !== 'auto' && (
          <button className="primary" onClick={abrir}>
            Actualizar valor
          </button>
        )}
        {p.fuente === 'auto' && <p className="muted chico">Se actualiza solo con la cotización del día.</p>}
      </section>

      <section className="card">
        <dl className="totales">
          {p.cantidad > 0 && (
            <div>
              <dt>Tenés</dt>
              <dd>
                <Oculto>{p.divisa ? formatMonto(p.cantidad, p.divisa) : `${formatCantidad(p.cantidad)} unidades`}</Oculto>
              </dd>
            </div>
          )}
          {p.pppUsd !== null && (
            <div>
              <dt>Precio promedio de compra</dt>
              <dd>
                {formatPrecio(p.pppUsd, 'USD')}
                {enOriginal
                  .filter((t) => t.moneda !== 'USD')
                  .map((t) => (
                    <span key={t.clave} className="muted chico bloque-linea">
                      {formatPrecio(t.ppp, t.moneda)} en {t.moneda}
                    </span>
                  ))}
              </dd>
            </div>
          )}
          {p.precioUsd !== null && p.fuente !== 'costo' && (
            <div>
              <dt>Precio actual</dt>
              <dd>{formatPrecio(p.precioUsd, 'USD')}</dd>
            </div>
          )}
          {abierta && (
            <div>
              <dt>Lo que pagaste por lo que tenés</dt>
              <dd>
                <Oculto>{usd(p.costoUsd)}</Oculto>
              </dd>
            </div>
          )}
          {Math.abs(p.realizadoUsd) >= 0.01 && (
            <div>
              <dt>Resultado de ventas ya hechas</dt>
              <dd className={p.realizadoUsd < 0 ? 'negativo' : 'positivo'}>
                <Oculto>{`${p.realizadoUsd >= 0 ? '+' : '−'}${usd(Math.abs(p.realizadoUsd))}`}</Oculto>
              </dd>
            </div>
          )}
        </dl>
        {p.aproximado && <p className="muted chico">Algunos montos se pasaron a dólares con la cotización de hoy (aproximado).</p>}
      </section>

      <section className="card">
        <h2>Movimientos</h2>
        <ul className="lista">
          {[...p.movimientos].reverse().map((m) => (
            <li key={m.id}>
              <Link to={`/movimiento/${m.id}`} className="fila">
                <div>
                  <div>{m.tipo === 'aporte' ? 'Invertiste' : 'Retiraste'}</div>
                  <div className="muted chico">
                    {fechaCorta(m.fecha)}
                    {m.cantidad ? ` · ${formatCantidad(m.cantidad)} a ${formatPrecio(m.monto / m.cantidad, m.moneda)}` : ''}
                    {m.nota ? ` · ${m.nota}` : ''}
                  </div>
                </div>
                <span className={`monto ${m.tipo === 'rescate' ? 'ingreso' : ''}`}>
                  <Oculto>{`${m.tipo === 'rescate' ? '+' : '−'} ${formatMonto(m.monto, m.moneda)}`}</Oculto>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {hoja && (
        <div className="hoja-fondo" onClick={() => setHoja(false)}>
          <div className="hoja formulario" role="dialog" aria-modal="true" aria-labelledby="actualizar-titulo" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-cabecera">
              <h2 id="actualizar-titulo">Valor de {p.nombre}</h2>
              <button className="boton-icono" onClick={() => setHoja(false)} aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            {p.cantidad > 0 && !p.porMonto && (
              <div className="segmentado chico" role="group" aria-label="Cómo cargar el valor">
                <button type="button" aria-pressed={modo === 'precio'} onClick={() => setModo('precio')}>
                  Precio por unidad
                </button>
                <button type="button" aria-pressed={modo === 'total'} onClick={() => setModo('total')}>
                  Valor total
                </button>
              </div>
            )}
            <p className="muted chico">
              {modo === 'precio'
                ? `Lo que vale hoy 1 unidad (lo ves en tu broker). Tenés ${formatCantidad(p.cantidad)}.`
                : 'Lo que vale hoy toda tu posición (lo ves en tu broker o app).'}
            </p>
            <div className="monto-y-moneda">
              <label>
                {modo === 'precio' ? 'Precio' : 'Valor total'}
                <InputNumero className="monto-input" decimales={modo === 'precio' ? 8 : 2} value={valorTexto} onChange={setValorTexto} placeholder="0" autoFocus />
              </label>
              <Combobox etiqueta="Moneda" opciones={opcionesMoneda} valor={moneda} onCambio={setMoneda} />
            </div>
            {modo === 'precio' && totalVista !== null && (
              <p className="muted chico">Tu posición valdría {formatMonto(Math.round(totalVista * 100) / 100, moneda)}.</p>
            )}
            {faltaSql && <p className="muted chico">Falta ejecutar el SQL de valuaciones en Supabase para poder guardarlo.</p>}
            {error && <p className="error">{error}</p>}
            <button className="primary" onClick={guardar} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar valor'}
            </button>
          </div>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
