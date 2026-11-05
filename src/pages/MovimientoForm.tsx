import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Combobox, { type Opcion } from '../components/Combobox'
import {
  FORMAS_PAGO,
  obtenerMovimiento,
  tipoCategoriaDe,
  useCategorias,
  type FormaPago,
  type TipoMovimiento,
} from '../lib/datos'
import { hoyISO, montoAEditable, parseMonto } from '../lib/format'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

type TipoPantalla = 'gasto' | 'ingreso' | 'inversion'

export default function MovimientoForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { categorias, loading: cargandoCategorias, recargar: recargarCategorias } = useCategorias()
  const favoritas = perfil?.monedas_favoritas ?? ['ARS']

  const [tipo, setTipo] = useState<TipoPantalla>('gasto')
  const [sentido, setSentido] = useState<'aporte' | 'rescate'>('aporte')
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState(favoritas[0])
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [formaPago, setFormaPago] = useState<FormaPago | null>(null)
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
        setFecha(m.fecha)
        setNota(m.nota ?? '')
      }
      setCargando(false)
    })
  }, [id])

  const tipoMovimiento: TipoMovimiento = tipo === 'inversion' ? sentido : tipo
  const visibles = categorias.filter(
    (c) => c.tipo === tipoCategoriaDe(tipoMovimiento) && (c.activa || c.id === categoriaId),
  )
  const monto = parseMonto(montoTexto)
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
  const opcionesFormaPago: Opcion[] = FORMAS_PAGO.map((f) => ({ valor: f.valor, texto: f.texto }))

  async function crearCategoria(nombre: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('categorias')
      .insert({ tipo: tipoCategoriaDe(tipoMovimiento), nombre })
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
    setError(null)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!monto) return setError('Ingresá un monto válido, por ejemplo 12.500 o 12500,50.')
    if (!categoriaId) return setError('Elegí una categoría.')
    if (tipo === 'gasto' && !formaPago) return setError('Elegí la forma de pago.')

    const datos = {
      tipo: tipoMovimiento,
      monto,
      moneda,
      categoria_id: categoriaId,
      forma_pago: tipo === 'gasto' ? formaPago : null,
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

        <Combobox
          etiqueta="Categoría"
          opciones={opcionesCategoria}
          valor={categoriaId}
          onCambio={setCategoriaId}
          placeholder="Buscar o crear categoría…"
          onCrear={crearCategoria}
          textoVacio="No hay categorías activas de este tipo."
        />

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
