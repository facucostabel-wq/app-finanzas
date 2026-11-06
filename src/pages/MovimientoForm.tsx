import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Combobox, { type Opcion } from '../components/Combobox'
import {
  FORMAS_PAGO,
  obtenerMovimiento,
  useActivos,
  tipoCategoriaDe,
  useCategorias,
  type FormaPago,
  type TipoMovimiento,
} from '../lib/datos'
import { formatPrecio, hoyISO, montoAEditable, parseCantidad, parseMonto } from '../lib/format'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

type TipoPantalla = 'gasto' | 'ingreso' | 'inversion' | 'pago_tarjeta'

export default function MovimientoForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { categorias, loading: cargandoCategorias, recargar: recargarCategorias } = useCategorias()
  const { activos, recargar: recargarActivos } = useActivos()
  const favoritas = perfil?.monedas_favoritas ?? ['ARS']

  const [tipo, setTipo] = useState<TipoPantalla>('gasto')
  const [sentido, setSentido] = useState<'aporte' | 'rescate'>('aporte')
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState(favoritas[0])
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [formaPago, setFormaPago] = useState<FormaPago | null>(null)
  const [activoId, setActivoId] = useState<string | null>(null)
  const [cantidadTexto, setCantidadTexto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(editando)

  // Al editar, traer el movimiento.
  useEffect(() => {
    if (!id) return
    obtenerMovimiento(id).then((m) => {
      if (!m) {
        setError('No se encontró el movimiento.')
      } else {
        setTipo(m.tipo === 'aporte' || m.tipo === 'rescate' ? 'inversion' : m.tipo)
        if (m.tipo === 'aporte' || m.tipo === 'rescate') setSentido(m.tipo)
        setMontoTexto(montoAEditable(m.monto))
        setMoneda(m.moneda)
        setCategoriaId(m.categoria_id)
        setFormaPago(m.forma_pago)
        setActivoId(m.activo_id)
        setCantidadTexto(m.cantidad ? montoAEditable(m.cantidad) : '')
        setFecha(m.fecha)
        setNota(m.nota ?? '')
      }
      setCargando(false)
    })
  }, [id])

  const tipoMovimiento: TipoMovimiento = tipo === 'inversion' ? sentido : tipo
  const esPagoTarjeta = tipo === 'pago_tarjeta'
  const tipoCat = tipoMovimiento === 'pago_tarjeta' ? null : tipoCategoriaDe(tipoMovimiento)
  const visibles = categorias.filter(
    (c) => c.tipo === tipoCat && (c.activa || c.id === categoriaId),
  )
  const monto = parseMonto(montoTexto)
  const cantidad = parseCantidad(cantidadTexto)
  const esInversion = tipo === 'inversion'
  // "Moneda extranjera": la subcategoría es la moneda (obligatoria) y la cantidad, las divisas compradas.
  const esDivisas = categorias.find((c) => c.id === categoriaId)?.es_divisas ?? false
  const divisa = esDivisas ? (activos.find((a) => a.id === activoId)?.divisa ?? null) : null
  // Cotización implícita: lo que costó (o se cobró) cada unidad, comisiones incluidas.
  const cotizacion = esInversion && monto && cantidad ? monto / cantidad : null
  // Monedas: primero las favoritas, después el resto.
  const opcionesMoneda: Opcion[] = [
    ...favoritas.map((c) => ({ valor: c, texto: c, detalle: nombreMoneda(c), grupo: 'Favoritas' })),
    ...MONEDAS.filter((m) => !favoritas.includes(m.codigo)).map((m) => ({
      valor: m.codigo,
      texto: m.codigo,
      detalle: m.nombre,
      grupo: 'Todas las monedas',
    })),
  ]
  const opcionesCategoria: Opcion[] = visibles.map((c) => ({ valor: c.id, texto: c.nombre }))
  const delaCategoria = activos.filter((a) => a.categoria_id === categoriaId && (a.activa || a.id === activoId))
  const opcionesActivo: Opcion[] = esDivisas
    ? [
        // Monedas ya usadas primero; después el resto, que se crean al elegirlas.
        ...delaCategoria.map((a) => ({ valor: a.id, texto: a.nombre, detalle: nombreMoneda(a.nombre), grupo: 'Tus monedas' })),
        ...MONEDAS.filter((m) => m.codigo !== 'ARS' && !delaCategoria.some((a) => a.divisa === m.codigo)).map((m) => ({
          valor: `nueva:${m.codigo}`,
          texto: m.codigo,
          detalle: m.nombre,
          grupo: 'Otras monedas',
        })),
      ]
    : delaCategoria.map((a) => ({ valor: a.id, texto: a.nombre }))
  const opcionesFormaPago: Opcion[] = FORMAS_PAGO.map((f) => ({ valor: f.valor, texto: f.texto }))

  async function crearActivo(nombre: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('activos')
      .insert({ categoria_id: categoriaId, nombre })
      .select('id')
      .single()
    if (error) {
      setError(error.code === '23505' ? 'Ya existe esa subcategoría.' : error.message)
      return null
    }
    await recargarActivos()
    return data.id as string
  }

  function cambiarCategoria(id: string) {
    if (id !== categoriaId) setActivoId(null) // las subcategorías dependen de la categoría
    setCategoriaId(id)
  }

  async function cambiarActivo(valor: string) {
    let id = valor
    let d: string | null = null
    if (valor.startsWith('nueva:')) {
      // Moneda que todavía no usaste: se crea la subcategoría en el momento.
      d = valor.slice(6)
      const { data, error } = await supabase
        .from('activos')
        .insert({ categoria_id: categoriaId, nombre: d, divisa: d })
        .select('id')
        .single()
      if (error) return setError(error.message)
      await recargarActivos()
      id = data.id as string
    } else {
      d = activos.find((a) => a.id === valor)?.divisa ?? null
    }
    setActivoId(id)
    // Una moneda se paga con otra: si coincidían, se pasa a la primera favorita distinta.
    if (d && moneda === d) setMoneda(favoritas.find((f) => f !== d) ?? 'ARS')
  }

  async function crearCategoria(nombre: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('categorias')
      .insert({ tipo: tipoCat, nombre })
      .select('id')
      .single()
    if (error) {
      setError(error.code === '23505' ? 'Ya existe una categoría con ese nombre (puede estar oculta en Ajustes).' : error.message)
      return null
    }
    await recargarCategorias()
    return data.id as string
  }

  function cambiarTipo(t: TipoPantalla) {
    setTipo(t)
    setCategoriaId(null) // las categorías dependen del tipo
    setActivoId(null)
    setError(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!monto) return setError('Ingresá un monto válido, por ejemplo 12.500 o 12500,50.')
    if (!esPagoTarjeta && !categoriaId) return setError('Elegí una categoría.')
    if (tipo === 'gasto' && !formaPago) return setError('Elegí la forma de pago.')
    if (esInversion && esDivisas && !activoId) return setError('Elegí qué moneda compraste o vendiste.')
    if (esInversion && esDivisas && !cantidad)
      return setError(`Indicá cuántos ${divisa ?? 'de la moneda'} compraste o vendiste.`)
    if (esInversion && divisa && moneda === divisa)
      return setError(`Pagar ${divisa} con ${divisa} es un movimiento entre cuentas, no una inversión.`)
    if (esInversion && cantidadTexto.trim() && !cantidad)
      return setError('La cantidad no es válida. Ejemplos: 0,0015 · 10 · 1.250,5')

    const datos = {
      tipo: tipoMovimiento,
      monto,
      moneda,
      categoria_id: esPagoTarjeta ? null : categoriaId,
      forma_pago: tipo === 'gasto' ? formaPago : null,
      activo_id: esInversion ? activoId : null,
      cantidad: esInversion ? cantidad : null,
      fecha,
      nota: nota.trim() || null,
    }
    setBusy(true)
    const { error } = editando
      ? await supabase.from('movimientos').update(datos).eq('id', id!)
      : await supabase.from('movimientos').insert(datos)
    setBusy(false)
    if (error) return setError(`No se pudo guardar: ${error.message}`)
    navigate(-1)
  }

  async function borrar() {
    if (!id || !window.confirm('¿Borrar este movimiento? No se puede deshacer.')) return
    setBusy(true)
    const { error } = await supabase.from('movimientos').delete().eq('id', id)
    setBusy(false)
    if (error) return setError(`No se pudo borrar: ${error.message}`)
    navigate(-1)
  }

  if (cargando || cargandoCategorias) return <main className="screen center muted">Cargando…</main>

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate(-1)}>
          ← Volver
        </button>
        <h1 className="titulo-chico">{editando ? 'Editar movimiento' : 'Nuevo movimiento'}</h1>
        <span style={{ width: 64 }} />
      </header>

      <form className="card formulario" onSubmit={guardar}>
        <div className="segmentado" role="group" aria-label="Tipo de movimiento">
          {(
            [
              ['gasto', 'Gasto'],
              ['ingreso', 'Ingreso'],
              ['inversion', 'Inversión'],
              ['pago_tarjeta', 'Pago tarjeta'],
            ] as [TipoPantalla, string][]
          ).map(([v, t]) => (
            <button type="button" key={v} aria-pressed={tipo === v} onClick={() => cambiarTipo(v)}>
              {t}
            </button>
          ))}
        </div>

        {tipo === 'inversion' && (
          <div className="segmentado chico" role="group" aria-label="Sentido de la inversión">
            <button type="button" aria-pressed={sentido === 'aporte'} onClick={() => setSentido('aporte')}>
              Invertí (sale plata)
            </button>
            <button type="button" aria-pressed={sentido === 'rescate'} onClick={() => setSentido('rescate')}>
              Retiré (vuelve plata)
            </button>
          </div>
        )}

        <label>
          Monto
          <input
            className="monto-input"
            inputMode="decimal"
            placeholder="0"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            autoFocus={!editando}
            aria-invalid={montoTexto !== '' && !monto}
          />
        </label>

        <Combobox
          etiqueta="Moneda"
          opciones={opcionesMoneda}
          valor={moneda}
          onCambio={setMoneda}
          placeholder="Buscar: dólar, real, EUR…"
        />

        {esPagoTarjeta ? (
          <p className="muted chico">
            Registrá cuánto pagaste del resumen de la tarjeta. No es un gasto nuevo (los consumos ya están cargados):
            solo descuenta del dinero disponible.
          </p>
        ) : (
          <Combobox
            etiqueta="Categoría"
            opciones={opcionesCategoria}
            valor={categoriaId}
            onCambio={cambiarCategoria}
            placeholder="Buscar o crear categoría…"
            onCrear={crearCategoria}
            textoVacio="No hay categorías activas de este tipo."
          />
        )}

        {esInversion && categoriaId && (
          <Combobox
            etiqueta={
              esDivisas ? (sentido === 'aporte' ? 'Moneda comprada' : 'Moneda vendida') : 'Subcategoría (opcional)'
            }
            opciones={opcionesActivo}
            valor={activoId}
            onCambio={cambiarActivo}
            placeholder={esDivisas ? 'Buscar: dólar, euro, real…' : 'Ej.: BTC, AAPL, YPF… o creá una'}
            onCrear={esDivisas ? undefined : crearActivo}
            textoVacio={esDivisas ? 'Sin resultados.' : 'Escribí para crear la primera subcategoría.'}
          />
        )}

        {esInversion && (
          <label>
            {esDivisas
              ? divisa
                ? `${divisa} ${sentido === 'aporte' ? 'comprados' : 'vendidos'}`
                : `Cantidad ${sentido === 'aporte' ? 'comprada' : 'vendida'}`
              : sentido === 'aporte'
                ? 'Cantidad comprada (opcional)'
                : 'Cantidad vendida (opcional)'}
            <input
              inputMode="decimal"
              placeholder="Ej.: 0,0015 · 10 · 1.250"
              value={cantidadTexto}
              onChange={(e) => setCantidadTexto(e.target.value)}
              aria-invalid={cantidadTexto !== '' && !cantidad}
            />
            <small className="muted">
              {esDivisas
                ? `En el resumen cuenta esta cantidad en ${divisa ?? 'esa moneda'}, sin conversión. El monto es lo que pagaste o cobraste.`
                : 'Unidades, nominales o cuotapartes.'}
            </small>
            {cotizacion && (
              <span className="cotizacion">
                {divisa ? (sentido === 'aporte' ? 'Compraste a ' : 'Vendiste a ') : 'Cotización: '}
                <strong>{formatPrecio(cotizacion, moneda)}</strong> {divisa ? `por ${divisa}` : 'por unidad'}
              </span>
            )}
          </label>
        )}

        {tipo === 'gasto' && (
          <Combobox
            etiqueta="Forma de pago"
            opciones={opcionesFormaPago}
            valor={formaPago}
            onCambio={(v) => setFormaPago(v as FormaPago)}
            placeholder="Buscar forma de pago…"
          />
        )}

        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>

        <label>
          Nota (opcional)
          <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} placeholder="Ej.: cena con amigos" />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
        {editando && (
          <button type="button" className="peligro" onClick={borrar} disabled={busy}>
            Borrar movimiento
          </button>
        )}
      </form>

    </main>
  )
}
