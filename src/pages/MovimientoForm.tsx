import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Combobox, { type Opcion } from '../components/Combobox'
import {
  obtenerMovimiento,
  TEXTO_TIPO_CUENTA,
  useActivos,
  tipoCategoriaDe,
  useCategorias,
  useCuentas,
  type TipoMovimiento,
} from '../lib/datos'
import { formatPrecio, hoyISO, montoAEditable, parseCantidad, parseMonto } from '../lib/format'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

type TipoPantalla = 'gasto' | 'ingreso' | 'inversion' | 'transferencia'

// Recuerda la última cuenta usada para cada tipo (comodidad local, no datos sensibles).
const claveCuenta = (t: TipoMovimiento) => `ultima-cuenta:${t}`
function leerUltimaCuenta(t: TipoMovimiento): string | null {
  try {
    return localStorage.getItem(claveCuenta(t))
  } catch {
    return null
  }
}
function guardarUltimaCuenta(t: TipoMovimiento, id: string) {
  try {
    localStorage.setItem(claveCuenta(t), id)
  } catch {
    /* sin almacenamiento disponible */
  }
}

export default function MovimientoForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { categorias, loading: cargandoCategorias, recargar: recargarCategorias } = useCategorias()
  const { activos, recargar: recargarActivos } = useActivos()
  const { cuentas, loading: cargandoCuentas } = useCuentas()
  const favoritas = perfil?.monedas_favoritas ?? ['ARS']

  const [tipo, setTipo] = useState<TipoPantalla>('gasto')
  const [sentido, setSentido] = useState<'aporte' | 'rescate'>('aporte')
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState(favoritas[0])
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [destinoId, setDestinoId] = useState<string | null>(null)
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
        setCuentaId(m.cuenta_id)
        setDestinoId(m.cuenta_destino_id)
        setActivoId(m.activo_id)
        setCantidadTexto(m.cantidad ? montoAEditable(m.cantidad) : '')
        setFecha(m.fecha)
        setNota(m.nota ?? '')
      }
      setCargando(false)
    })
  }, [id])

  const tipoMovimiento: TipoMovimiento = tipo === 'inversion' ? sentido : tipo
  const esTransferencia = tipo === 'transferencia'
  const tipoCat = tipoMovimiento === 'transferencia' ? null : tipoCategoriaDe(tipoMovimiento)
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
  const cuentasActivas = cuentas.filter((c) => c.activa || c.id === cuentaId || c.id === destinoId)
  const opcionesCuenta: Opcion[] = cuentasActivas.map((c) => ({
    valor: c.id,
    texto: c.nombre,
    detalle: TEXTO_TIPO_CUENTA[c.tipo],
  }))
  const opcionesDestino = opcionesCuenta.filter((o) => o.valor !== cuentaId)
  const destinoEsTarjeta = cuentas.find((c) => c.id === destinoId)?.tipo === 'tarjeta'
  const etiquetaCuenta = esTransferencia
    ? 'Desde'
    : tipoMovimiento === 'gasto'
      ? 'Pagaste con'
      : tipoMovimiento === 'ingreso'
        ? 'Entró a'
        : tipoMovimiento === 'aporte'
          ? 'Sale de'
          : 'Entra a'

  // Movimiento nuevo: propone la última cuenta usada para este tipo.
  useEffect(() => {
    if (editando || cargandoCuentas) return
    const ultima = leerUltimaCuenta(tipoMovimiento)
    setCuentaId(ultima && cuentas.some((c) => c.id === ultima && c.activa) ? ultima : null)
  }, [tipoMovimiento, editando, cargandoCuentas, cuentas])

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
    if (!esTransferencia && !categoriaId) return setError('Elegí una categoría.')
    if (!cuentaId) return setError(esTransferencia ? 'Elegí la cuenta de origen.' : 'Elegí la cuenta.')
    if (esTransferencia && !destinoId) return setError('Elegí la cuenta de destino.')
    if (esTransferencia && destinoId === cuentaId) return setError('El origen y el destino tienen que ser distintos.')
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
      categoria_id: esTransferencia ? null : categoriaId,
      cuenta_id: cuentaId,
      cuenta_destino_id: esTransferencia ? destinoId : null,
      forma_pago: null,
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
    guardarUltimaCuenta(tipoMovimiento, cuentaId)
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

  if (cargando || cargandoCategorias || cargandoCuentas) return <main className="screen center muted">Cargando…</main>

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
              ['transferencia', 'Transferir'],
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

        {cuentas.length === 0 && (
          <p className="aviso">
            Todavía no tenés cuentas. <Link to="/ajustes">Creá una en Ajustes</Link> (banco, billetera, efectivo o
            tarjeta) para poder cargar movimientos.
          </p>
        )}

        {esTransferencia ? (
          <>
            <Combobox
              etiqueta="Desde"
              opciones={opcionesCuenta}
              valor={cuentaId}
              onCambio={(v) => {
                setCuentaId(v)
                if (v === destinoId) setDestinoId(null)
              }}
              placeholder="Buscar cuenta…"
            />
            <Combobox
              etiqueta="Hacia"
              opciones={opcionesDestino}
              valor={destinoId}
              onCambio={setDestinoId}
              placeholder="Buscar cuenta…"
            />
            <p className="muted chico">
              {destinoEsTarjeta
                ? 'Pago de tarjeta: no es un gasto nuevo (los consumos ya están cargados); baja el disponible y la deuda de la tarjeta.'
                : 'Mueve plata entre tus cuentas: no es gasto ni ingreso y no cambia tu disponible total.'}
            </p>
          </>
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

        {!esTransferencia && (
          <Combobox
            etiqueta={etiquetaCuenta}
            opciones={opcionesCuenta}
            valor={cuentaId}
            onCambio={setCuentaId}
            placeholder="Buscar cuenta o tarjeta…"
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
