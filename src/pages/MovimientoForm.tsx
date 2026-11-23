import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Combobox, { type Opcion } from '../components/Combobox'
import {
  obtenerCompra,
  obtenerMovimiento,
  nombreCuenta,
  TEXTO_TIPO_CUENTA,
  useActivos,
  tipoCategoriaDe,
  useCategorias,
  useCuentas,
  useInversiones,
  useSaldosAl,
  type Movimiento,
  type TipoMovimiento,
} from '../lib/datos'
import { formatCantidad, formatMonto, formatPrecio, hoyISO, montoAEditable, nombreMes, parseCantidad, parseMonto } from '../lib/format'
import { Aviso, avisoFecha, avisoFondos, efectosDe, opcionesConSaldo, saldoDe } from '../lib/avisos'
import { calcularTenencias } from '../lib/tenencias'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'
import InputNumero from '../components/InputNumero'
import { useTiposHoy } from '../lib/cotizaciones'
import { crearPersona, esCuentaInterna, useMovimientosDelMes } from '../lib/datos'
import { estadoPresupuestos, usePresupuestos } from '../lib/presupuestos'
import CampoEtiquetas from '../components/CampoEtiquetas'
import { guardarEtiquetado, useEtiquetas, vigenteEn } from '../lib/etiquetas'

type TipoPantalla = 'gasto' | 'ingreso' | 'inversion' | 'transferencia' | 'prestamo'

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
  const { cuentas, loading: cargandoCuentas, recargar: recargarCuentas } = useCuentas()
  const favoritas = perfil?.monedas_favoritas ?? ['ARS']

  const [params] = useSearchParams()
  const [tipo, setTipo] = useState<TipoPantalla>(() => (!editando && params.get('tipo') === 'prestamo' ? 'prestamo' : 'gasto'))
  // Préstamos: la persona (su cuenta) y si le diste plata o te dio.
  const [personaId, setPersonaId] = useState<string | null>(() => (!editando ? params.get('persona') : null))
  const [sentidoPrestamo, setSentidoPrestamo] = useState<'di' | 'recibi'>(() => (params.get('sentido') === 'recibi' ? 'recibi' : 'di'))
  const [sentido, setSentido] = useState<'aporte' | 'rescate'>('aporte')
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState(favoritas[0])
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [cuentaId, setCuentaId] = useState<string | null>(null)
  const [destinoId, setDestinoId] = useState<string | null>(null)
  // Cuotas (solo gastos con tarjeta). Si se edita una cuota, se edita la compra entera.
  const [cuotas, setCuotas] = useState(1)
  const [compraId, setCompraId] = useState<string | null>(null)
  const [cuotaN, setCuotaN] = useState<number | null>(null)
  const [activoId, setActivoId] = useState<string | null>(null)
  const [cantidadTexto, setCantidadTexto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(editando)
  // Cómo estaba guardado (al editar), para no contarlo dos veces en los avisos.
  const [original, setOriginal] = useState<Movimiento | null>(null)
  const [delDia, setDelDia] = useState<Movimiento[]>([])
  const saldosFecha = useSaldosAl(fecha)
  // Etiquetas: las elegidas; al cargar uno nuevo, las de un evento en curso se agregan solas.
  const et = useEtiquetas()
  const [etiquetasElegidas, setEtiquetasElegidas] = useState<string[]>([])
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())
  const [etiquetasCargadas, setEtiquetasCargadas] = useState(!editando)
  const porEvento = et.etiquetas.filter((e) => vigenteEn(e, fecha)).map((e) => e.id)
  const { movimientos: inversiones } = useInversiones()

  // Al editar, traer el movimiento.
  useEffect(() => {
    if (!id) return
    obtenerMovimiento(id).then(async (m) => {
      if (m?.compra_id) {
        // Es una cuota: se carga la compra completa.
        const c = await obtenerCompra(m.compra_id)
        if (c) {
          setTipo('gasto')
          setMontoTexto(montoAEditable(c.monto_total))
          setMoneda(c.moneda)
          setCategoriaId(c.categoria_id)
          setCuentaId(c.cuenta_id)
          setFecha(c.fecha)
          setNota(c.nota ?? '')
          setCuotas(c.cuotas)
          setCompraId(c.id)
          setCuotaN(m.cuota_n)
          setCargando(false)
          return
        }
      }
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
        setOriginal(m)
      }
      setCargando(false)
    })
  }, [id])

  // Al editar: las etiquetas que ya tenía.
  useEffect(() => {
    if (!editando || etiquetasCargadas || et.loading || cargando) return
    setEtiquetasElegidas(et.deMovimiento({ id: id!, compra_id: compraId }).map((e) => e.id))
    setEtiquetasCargadas(true)
  }, [editando, etiquetasCargadas, et, cargando, id, compraId])
  // Nuevo: suma las de eventos en curso para la fecha elegida (salvo las que quitaste).
  const claveEvento = porEvento.join(',')
  useEffect(() => {
    if (editando || !claveEvento) return
    setEtiquetasElegidas((prev) => [...new Set([...prev, ...claveEvento.split(',').filter((x) => !descartadas.has(x))])])
  }, [editando, claveEvento, descartadas])

  // Una transferencia con una persona se edita como préstamo.
  const [prestamoDetectado, setPrestamoDetectado] = useState(false)
  useEffect(() => {
    if (!original || prestamoDetectado || cargandoCuentas || original.tipo !== 'transferencia') return
    const tipoDe = (cid: string | null) => cuentas.find((c) => c.id === cid)?.tipo
    if (tipoDe(original.cuenta_destino_id) === 'persona') {
      setTipo('prestamo')
      setSentidoPrestamo('di')
      setPersonaId(original.cuenta_destino_id)
      setCuentaId(original.cuenta_id)
    } else if (tipoDe(original.cuenta_id) === 'persona') {
      setTipo('prestamo')
      setSentidoPrestamo('recibi')
      setPersonaId(original.cuenta_id)
      setCuentaId(original.cuenta_destino_id)
    }
    setPrestamoDetectado(true)
  }, [original, prestamoDetectado, cargandoCuentas, cuentas])

  const esPrestamo = tipo === 'prestamo'
  const tipoMovimiento: TipoMovimiento = tipo === 'inversion' ? sentido : tipo === 'prestamo' ? 'transferencia' : tipo
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
  // Las cuentas de grupo las maneja la pantalla de grupos.
  const cuentasActivas = cuentas.filter(
    (c) => (c.activa && !esCuentaInterna(c.tipo)) || ((c.id === cuentaId || c.id === destinoId) && c.tipo !== 'persona'),
  )
  const personas = cuentas.filter((c) => c.tipo === 'persona' && (c.activa || c.id === personaId || c.id === cuentaId))
  const opcionesPersona: Opcion[] = personas.map((c) => ({ valor: c.id, texto: c.nombre }))
  const opcionesCuenta: Opcion[] = cuentasActivas.map((c) => ({
    valor: c.id,
    texto: nombreCuenta(c),
    detalle: TEXTO_TIPO_CUENTA[c.tipo],
  }))
  const opcionesDestino = opcionesCuenta.filter((o) => o.valor !== cuentaId)
  // Lo que ya estaba guardado de este movimiento no cuenta para los avisos.
  const descontar = original && original.fecha <= fecha ? efectosDe(original) : []
  const saleplata = tipoMovimiento === 'gasto' || tipoMovimiento === 'aporte' || tipoMovimiento === 'transferencia'
  const opcionesOrigen = [
    ...(saleplata ? opcionesConSaldo(cuentasActivas, moneda, saldosFecha, descontar) : opcionesCuenta),
    // Un gasto tuyo que pagó otra persona: queda como que le debés.
    ...(tipoMovimiento === 'gasto' && !esPrestamo
      ? personas.map((c) => ({ valor: c.id, texto: c.nombre, detalle: 'Lo pagó y le debés', grupo: 'Lo pagó otra persona' }))
      : []),
  ]
  const pagoOtraPersona = tipoMovimiento === 'gasto' && cuentas.find((c) => c.id === cuentaId)?.tipo === 'persona'
  async function nuevaPersona(nombre: string) {
    const r = await crearPersona(nombre)
    if (r.error) setError(r.error)
    else await recargarCuentas()
    return r.id
  }
  const destinoEsTarjeta = cuentas.find((c) => c.id === destinoId)?.tipo === 'tarjeta'
  const conTarjeta = tipoMovimiento === 'gasto' && cuentas.find((c) => c.id === cuentaId)?.tipo === 'tarjeta'
  const enCuotas = conTarjeta && cuotas > 1
  const valorCuota = enCuotas && monto ? Math.round((monto / cuotas) * 100) / 100 : null
  const ultimaCuota = (() => {
    if (!enCuotas) return null
    const [y, m] = fecha.split('-').map(Number)
    const d = new Date(y, m - 1 + cuotas - 1, 1)
    return nombreMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`).toLowerCase()
  })()
  const etiquetaCuenta = esTransferencia
    ? 'Desde'
    : tipoMovimiento === 'gasto'
      ? 'Pagaste con'
      : tipoMovimiento === 'ingreso'
        ? 'Entró a'
        : tipoMovimiento === 'aporte'
          ? 'Sale de'
          : 'Entra a'

  // ---- Avisos (no frenan: se puede guardar igual) ----
  const cuenta = cuentas.find((c) => c.id === cuentaId)
  const destino = cuentas.find((c) => c.id === destinoId)
  const avisoCuenta = saleplata && !(tipo === 'prestamo' && sentidoPrestamo === 'recibi')
    ? avisoFondos({
        cuenta,
        moneda,
        monto,
        saldos: saldosFecha,
        descontar,
        verbo: tipoMovimiento === 'aporte' ? 'con esta inversión' : esTransferencia ? 'con esta transferencia' : 'con este gasto',
      })
    : null
  // Pago de tarjeta mayor a lo que se debe.
  const avisoTarjeta = (() => {
    if (!esTransferencia || !destinoEsTarjeta || !destino || !monto || !saldosFecha) return null
    const deuda = Math.round(-saldoDe(saldosFecha, destino.id, moneda, descontar) * 100) / 100
    if (deuda <= 0.005) return `${nombreCuenta(destino)} no tiene deuda en ${moneda} a esa fecha.`
    if (monto > deuda + 0.005)
      return `${nombreCuenta(destino)} debe ${formatMonto(deuda, moneda)}; estás pagando ${formatMonto(Math.round((monto - deuda) * 100) / 100, moneda)} de más.`
    return null
  })()
  // Retirar más unidades de las que tenés.
  const avisoCantidad = (() => {
    if (!esInversion || sentido !== 'rescate' || !activoId || !cantidad) return null
    const previas = inversiones.filter((m) => m.id !== id && m.fecha <= fecha && m.activo_id === activoId)
    const tenencia = calcularTenencias(previas).reduce((t, x) => t + x.cantidad, 0)
    const nombre = activos.find((a) => a.id === activoId)?.nombre ?? 'esa inversión'
    if (tenencia <= 1e-9) return `No tenés ${nombre} cargado a esa fecha.`
    if (cantidad > tenencia + 1e-9) return `Tenés ${formatCantidad(tenencia)} de ${nombre}; estás retirando ${formatCantidad(cantidad)}.`
    return null
  })()
  // Uno igual el mismo día (mismo tipo, monto, moneda, categoría y cuentas).
  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return
    let vigente = true
    supabase
      .from('movimientos')
      .select('id, tipo, monto, moneda, categoria_id, cuenta_id, cuenta_destino_id, compra_id')
      .eq('fecha', fecha)
      .then(({ data }) => vigente && setDelDia(((data ?? []) as Movimiento[]).map((m) => ({ ...m, monto: Number(m.monto) }))))
    return () => {
      vigente = false
    }
  }, [fecha])
  const duplicado =
    !enCuotas &&
    monto &&
    delDia.some(
      (m) =>
        m.id !== id &&
        !m.compra_id &&
        m.tipo === tipoMovimiento &&
        m.moneda === moneda &&
        Math.abs(m.monto - monto) < 0.005 &&
        m.cuenta_id === cuentaId &&
        (esTransferencia ? m.cuenta_destino_id === destinoId : m.categoria_id === categoriaId),
    )
  const avisoFechaFutura = avisoFecha(fecha)

  // Presupuesto: aviso suave si con este gasto te acercás (80%) o te pasás del tope del mes.
  const { presupuestos } = usePresupuestos()
  const { movimientos: movsMesFecha } = useMovimientosDelMes(fecha.slice(0, 7))
  const tiposPresu = useTiposHoy(['USD', moneda, ...presupuestos.map((p) => p.moneda)])
  let avisoPresupuesto: string | null = null
  if (tipoMovimiento === 'gasto' && monto && presupuestos.length) {
    const esteMonto = valorCuota ?? monto
    const otros = movsMesFecha.filter((m) => m.id !== id && !(compraId && m.compra_id === compraId))
    const nuevo = { ...(otros[0] ?? {}), id: 'nuevo', tipo: 'gasto', monto: esteMonto, moneda, categoria_id: categoriaId } as Movimiento
    const antes = estadoPresupuestos(presupuestos, otros, tiposPresu)
    const despues = estadoPresupuestos(presupuestos, [...otros, nuevo], tiposPresu)
    const relevantes = despues
      .map((d, i) => ({ d, a: antes[i] }))
      .filter(({ d }) => d.presupuesto.categoria_id === null || d.presupuesto.categoria_id === categoriaId)
      .filter(({ d }) => d.limite > 0 && d.uso !== null && d.uso >= 0.8)
      .sort((x, y) => Number(x.d.presupuesto.categoria_id === null) - Number(y.d.presupuesto.categoria_id === null))
    const r = relevantes[0]
    if (r) {
      const nombre = r.d.presupuesto.categoria_id
        ? `de ${categorias.find((c) => c.id === r.d.presupuesto.categoria_id)?.nombre ?? 'la categoría'}`
        : 'general'
      const m = r.d.presupuesto.moneda
      avisoPresupuesto =
        r.d.uso! > 1
          ? `Con esto ${r.a.uso !== null && r.a.uso > 1 ? 'seguís pasado' : 'te pasás'} del presupuesto ${nombre}: ${formatMonto(Math.round(r.d.gastado * 100) / 100, m)} de ${formatMonto(Math.round(r.d.limite * 100) / 100, m)}.`
          : `Con esto llegás al ${Math.round(r.d.uso! * 100)}% del presupuesto ${nombre}.`
    }
  }

  // Movimiento nuevo: propone la última cuenta usada para este tipo.
  // Solo al cambiar de tipo (no cuando se recargan las cuentas, p. ej. al agregar una persona).
  const [propuestaPara, setPropuestaPara] = useState<string | null>(null)
  useEffect(() => {
    if (editando || cargandoCuentas || propuestaPara === tipoMovimiento) return
    const ultima = leerUltimaCuenta(tipoMovimiento)
    setCuentaId(ultima && cuentas.some((c) => c.id === ultima && c.activa && c.tipo !== 'persona') ? ultima : null)
    setPropuestaPara(tipoMovimiento)
  }, [tipoMovimiento, editando, cargandoCuentas, cuentas, propuestaPara])

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
    if (esPrestamo) {
      if (!personaId) return setError('Elegí la persona (o escribí su nombre para agregarla).')
      if (!cuentaId) return setError(sentidoPrestamo === 'di' ? 'Elegí de qué cuenta salió la plata.' : 'Elegí a qué cuenta entró la plata.')
      const datosPrestamo = {
        tipo: 'transferencia',
        monto,
        moneda,
        categoria_id: null,
        cuenta_id: sentidoPrestamo === 'di' ? cuentaId : personaId,
        cuenta_destino_id: sentidoPrestamo === 'di' ? personaId : cuentaId,
        forma_pago: null,
        activo_id: null,
        cantidad: null,
        fecha,
        nota: nota.trim() || null,
      }
      setBusy(true)
      const { error } = editando
        ? await supabase.from('movimientos').update(datosPrestamo).eq('id', id!)
        : await supabase.from('movimientos').insert(datosPrestamo)
      setBusy(false)
      if (error) return setError(`No se pudo guardar: ${error.message}`)
      return navigate(-1)
    }
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
    const error = await guardarEnBase(datos)
    setBusy(false)
    if (error) return setError(`No se pudo guardar: ${error}`)
    guardarUltimaCuenta(tipoMovimiento, cuentaId)
    navigate(-1)
  }

  /**
   * Guarda según el caso: compra en cuotas (la base genera las cuotas) o movimiento
   * común. Si cambia de uno a otro al editar, reemplaza el registro anterior.
   */
  async function guardarEnBase(datos: Record<string, unknown>): Promise<string | null> {
    // Dónde quedan colgadas las etiquetas: la compra (todas sus cuotas) o el movimiento.
    let destino: { movimiento_id?: string; compra_id?: string } | null = null
    const resultado = await (async (): Promise<string | null> => {
      if (enCuotas) {
        const compra = {
          fecha,
          monto_total: monto,
          moneda,
          cuotas,
          cuenta_id: cuentaId,
          categoria_id: categoriaId,
          nota: nota.trim() || null,
        }
        if (compraId) {
          const { error } = await supabase.from('compras_cuotas').update(compra).eq('id', compraId)
          destino = { compra_id: compraId }
          return error?.message ?? null
        }
        const { data, error } = await supabase.from('compras_cuotas').insert(compra).select('id').single()
        if (error) return error.message
        destino = { compra_id: data.id as string }
        if (editando) await supabase.from('movimientos').delete().eq('id', id!) // era un gasto en un pago
        return null
      }
      if (compraId) {
        // Pasó de cuotas a un solo pago: se borra la compra y queda un gasto común.
        const { data, error } = await supabase.from('movimientos').insert(datos).select('id').single()
        if (error) return error.message
        destino = { movimiento_id: data.id as string }
        await supabase.from('compras_cuotas').delete().eq('id', compraId)
        return null
      }
      if (editando) {
        const { error } = await supabase.from('movimientos').update(datos).eq('id', id!)
        destino = { movimiento_id: id! }
        return error?.message ?? null
      }
      const { data, error } = await supabase.from('movimientos').insert(datos).select('id').single()
      if (error) return error.message
      destino = { movimiento_id: data.id as string }
      return null
    })()
    if (resultado || !destino || et.falta) return resultado
    // Las etiquetas no bloquean el guardado: si fallan, se avisa pero el movimiento ya quedó.
    const ids = esTransferencia ? [] : etiquetasElegidas
    if (!editando && !ids.length) return null
    const err = await guardarEtiquetado(destino, ids)
    if (err) window.alert(`El movimiento se guardó, pero no sus etiquetas: ${err}`)
    return null
  }

  async function borrar() {
    if (compraId) {
      if (!window.confirm(`¿Borrar la compra completa y sus ${cuotas} cuotas? No se puede deshacer.`)) return
      setBusy(true)
      const { error } = await supabase.from('compras_cuotas').delete().eq('id', compraId)
      setBusy(false)
      if (error) return setError(`No se pudo borrar: ${error.message}`)
      return navigate(-1)
    }
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
        <h1 className="titulo-chico">{compraId ? 'Editar compra en cuotas' : editando ? 'Editar movimiento' : 'Nuevo movimiento'}</h1>
        <span style={{ width: 64 }} />
      </header>

      <form className="card formulario" onSubmit={guardar}>
        {compraId && cuotaN && (
          <p className="aviso">
            Esta es la cuota {cuotaN} de {cuotas}. Los cambios se aplican a toda la compra.
          </p>
        )}
        <div className="segmentado tipos-mov" role="group" aria-label="Tipo de movimiento">
          {(
            [
              ['gasto', 'Gasto'],
              ['ingreso', 'Ingreso'],
              ['inversion', 'Inversión'],
              ['transferencia', 'Transferir'],
              ['prestamo', 'Préstamo'],
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
          {enCuotas ? 'Monto total' : 'Monto'}
          <InputNumero
            calculadora
            className="monto-input"
            placeholder="0"
            value={montoTexto}
            onChange={setMontoTexto}
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
            Todavía no tenés cuentas. <Link to="/ajustes/cuentas">Creá una en Ajustes</Link> (banco, billetera, efectivo o
            tarjeta) para poder cargar movimientos.
          </p>
        )}

        {esPrestamo ? (
          <>
            <div className="segmentado chico" role="group" aria-label="Qué pasó">
              <button type="button" aria-pressed={sentidoPrestamo === 'di'} onClick={() => setSentidoPrestamo('di')}>
                Le di plata
              </button>
              <button type="button" aria-pressed={sentidoPrestamo === 'recibi'} onClick={() => setSentidoPrestamo('recibi')}>
                Me dio plata
              </button>
            </div>
            <Combobox
              etiqueta="Persona"
              opciones={opcionesPersona}
              valor={personaId}
              onCambio={setPersonaId}
              placeholder="Buscar o escribir un nombre…"
              onCrear={nuevaPersona}
              textoCrear={(t) => `+ Agregar a "${t}"`}
              textoVacio="Escribí el nombre para agregarla."
            />
            <Combobox
              etiqueta={sentidoPrestamo === 'di' ? 'Salió de' : 'Entró a'}
              opciones={sentidoPrestamo === 'di' ? opcionesConSaldo(cuentasActivas, moneda, saldosFecha, descontar) : opcionesCuenta}
              valor={cuentaId}
              onCambio={setCuentaId}
              placeholder="Buscar cuenta…"
            />
            <p className="muted chico">
              {sentidoPrestamo === 'di'
                ? 'Le prestaste plata o le devolviste lo que le debías. No cuenta como gasto: queda registrado en Deudas.'
                : 'Te prestó plata o te devolvió lo que te debía. No cuenta como ingreso: queda registrado en Deudas.'}
            </p>
          </>
        ) : esTransferencia ? (
          <>
            <Combobox
              etiqueta="Desde"
              opciones={opcionesOrigen}
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
            {avisoCuenta && <Aviso>{avisoCuenta}</Aviso>}
            {avisoTarjeta && <Aviso>{avisoTarjeta}</Aviso>}
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
            <InputNumero
              decimales={10}
              placeholder="Ej.: 0,0015 · 10 · 1.250"
              value={cantidadTexto}
              onChange={setCantidadTexto}
              aria-invalid={cantidadTexto !== '' && !cantidad}
            />
            <small className="muted">
              {esDivisas
                ? `En el resumen cuenta esta cantidad en ${divisa ?? 'esa moneda'}, sin conversión. El monto es lo que pagaste o cobraste.`
                : 'Unidades, nominales o cuotapartes.'}
            </small>
            {avisoCantidad && <Aviso>{avisoCantidad}</Aviso>}
            {cotizacion && (
              <span className="cotizacion">
                {divisa ? (sentido === 'aporte' ? 'Compraste a ' : 'Vendiste a ') : 'Cotización: '}
                <strong>{formatPrecio(cotizacion, moneda)}</strong> {divisa ? `por ${divisa}` : 'por unidad'}
              </span>
            )}
          </label>
        )}

        {!esTransferencia && !esPrestamo && (
          <Combobox
            etiqueta={etiquetaCuenta}
            opciones={opcionesOrigen}
            valor={cuentaId}
            onCambio={setCuentaId}
            placeholder={tipoMovimiento === 'gasto' ? 'Buscar cuenta, tarjeta o persona…' : 'Buscar cuenta o tarjeta…'}
            onCrear={tipoMovimiento === 'gasto' ? nuevaPersona : undefined}
            textoCrear={(t) => `+ Lo pagó "${t}" (le vas a deber)`}
          />
        )}
        {pagoOtraPersona && (
          <p className="muted chico">
            Es un gasto tuyo que pagó {cuentas.find((c) => c.id === cuentaId)?.nombre}: queda como que le debés, en Deudas.
          </p>
        )}
        {!esTransferencia && !esPrestamo && avisoCuenta && <Aviso>{avisoCuenta}</Aviso>}

        {conTarjeta && (
          <div className="grupo">
            <span className="grupo-titulo">Cuotas</span>
            <div className="chips">
              {[1, 3, 6, 9, 12, 18].map((n) => (
                <button
                  type="button"
                  key={n}
                  className="chip"
                  aria-pressed={cuotas === n}
                  onClick={() => setCuotas(n)}
                >
                  {n === 1 ? 'En un pago' : n}
                </button>
              ))}
              <input
                className="chip-input"
                inputMode="numeric"
                placeholder="Otra"
                aria-label="Otra cantidad de cuotas"
                value={[1, 3, 6, 9, 12, 18].includes(cuotas) ? '' : String(cuotas)}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10)
                  setCuotas(Number.isFinite(n) && n >= 1 && n <= 60 ? n : 1)
                }}
              />
            </div>
            {enCuotas && (
              <span className="cotizacion">
                {cuotas} cuotas de <strong>{valorCuota ? formatMonto(valorCuota, moneda) : '—'}</strong>
                {ultimaCuota && `, la última en ${ultimaCuota}`}
              </span>
            )}
          </div>
        )}

        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        {!esTransferencia && !esPrestamo && !et.falta && (
          <CampoEtiquetas
            todas={et.etiquetas}
            elegidas={etiquetasElegidas}
            porEvento={editando ? [] : porEvento}
            onCreada={() => et.recargar()}
            onCambio={(ids) => {
              const quitadas = etiquetasElegidas.filter((x) => !ids.includes(x))
              if (quitadas.length) setDescartadas((d) => new Set([...d, ...quitadas]))
              setEtiquetasElegidas(ids)
            }}
          />
        )}
        {avisoFechaFutura && <Aviso>{avisoFechaFutura}</Aviso>}
        {avisoPresupuesto && <Aviso>{avisoPresupuesto}</Aviso>}
        {duplicado && <Aviso>Ya cargaste uno igual ese día (mismo monto, {esTransferencia ? 'cuentas' : 'categoría y cuenta'}).</Aviso>}

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
            {compraId ? 'Borrar compra completa' : 'Borrar movimiento'}
          </button>
        )}
      </form>

    </main>
  )
}
