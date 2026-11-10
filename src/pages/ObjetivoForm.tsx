import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Combobox from '../components/Combobox'
import IconoCategoria from '../components/IconoCategoria'
import SelectorIcono from '../components/SelectorIcono'
import { hoyISO, montoAEditable, parseMonto } from '../lib/format'
import { MONEDAS } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'

/** Alta y edición de un objetivo. */
export default function ObjetivoForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const [nombre, setNombre] = useState('')
  const [icono, setIcono] = useState<string | null>(null)
  const [eligiendoIcono, setEligiendoIcono] = useState(false)
  const [montoTexto, setMontoTexto] = useState('')
  const [moneda, setMoneda] = useState('USD')
  const [conFecha, setConFecha] = useState(false)
  const [fecha, setFecha] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    supabase
      .from('objetivos')
      .select('nombre, icono, monto, moneda, fecha')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return setError('No se encontró el objetivo.')
        setNombre(data.nombre)
        setIcono(data.icono)
        setMontoTexto(montoAEditable(Number(data.monto)))
        setMoneda(data.moneda)
        setConFecha(Boolean(data.fecha))
        setFecha(data.fecha ?? '')
      })
  }, [id])

  const favoritas = perfil?.monedas_favoritas ?? ['ARS', 'USD']
  const opcionesMoneda = [
    ...MONEDAS.filter((m) => m.codigo === 'USD' || favoritas.includes(m.codigo)).map((m) => ({
      valor: m.codigo,
      texto: m.codigo,
      detalle: m.nombre,
      grupo: 'Favoritas',
    })),
    ...MONEDAS.filter((m) => m.codigo !== 'USD' && !favoritas.includes(m.codigo)).map((m) => ({
      valor: m.codigo,
      texto: m.codigo,
      detalle: m.nombre,
      grupo: 'Otras',
    })),
  ]

  async function guardar() {
    setError(null)
    const monto = parseMonto(montoTexto)
    if (!nombre.trim()) return setError('Poné un nombre, por ejemplo "Compu nueva".')
    if (!monto || monto <= 0) return setError('Poné cuánto cuesta.')
    if (conFecha && !fecha) return setError('Elegí la fecha o marcá "Sin fecha".')
    if (conFecha && fecha <= hoyISO()) return setError('La fecha tiene que ser más adelante que hoy.')
    const datos = { nombre: nombre.trim(), icono, monto, moneda, fecha: conFecha ? fecha : null }
    setBusy(true)
    const r = editando
      ? await supabase.from('objetivos').update(datos).eq('id', id!).select('id').single()
      : await supabase.from('objetivos').insert(datos).select('id').single()
    setBusy(false)
    if (r.error) return setError(r.error.message)
    navigate(`/objetivos/${r.data.id}`, { replace: true })
  }

  return (
    <main className="screen">
      <header className="subpagina">
        <button className="volver link" onClick={() => navigate(-1)}>
          ‹ Volver
        </button>
        <h1>{editando ? 'Editar objetivo' : 'Nuevo objetivo'}</h1>
      </header>

      <section className="card formulario">
        <div className="nombre-con-icono">
          <button type="button" className="boton-icono-cat" onClick={() => setEligiendoIcono(true)} aria-label="Elegir ícono">
            <IconoCategoria nombre={nombre} icono={icono} tipo="gasto" />
          </button>
          <label>
            ¿Para qué es?
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={40} placeholder="Ej.: Compu nueva" />
          </label>
        </div>

        <label>
          ¿Cuánto cuesta?
          <input
            className="monto-input"
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            placeholder="0"
          />
        </label>
        <Combobox etiqueta="Moneda" opciones={opcionesMoneda} valor={moneda} onCambio={setMoneda} placeholder="Buscar moneda…" />
        {moneda === 'ARS' && (
          <p className="muted chico">
            Ojo: con la inflación, un objetivo en pesos queda corto con el tiempo. Para compras grandes conviene en
            dólares.
          </p>
        )}

        <div className="grupo">
          <span className="grupo-titulo">¿Para cuándo?</span>
          <div className="segmentado chico" role="group" aria-label="Fecha del objetivo">
            <button type="button" aria-pressed={!conFecha} onClick={() => setConFecha(false)}>
              Sin fecha
            </button>
            <button type="button" aria-pressed={conFecha} onClick={() => setConFecha(true)}>
              Con fecha
            </button>
          </div>
          {conFecha ? (
            <input type="date" value={fecha} min={hoyISO()} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha" />
          ) : (
            <p className="muted chico">Te vamos diciendo cuándo llegás al ritmo que vayas ahorrando.</p>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={guardar} disabled={busy}>
          {busy ? 'Guardando…' : editando ? 'Guardar' : 'Crear objetivo'}
        </button>
      </section>

      {eligiendoIcono && (
        <SelectorIcono
          nombre={nombre}
          tipo="gasto"
          actual={icono}
          onElegir={(i) => {
            setIcono(i)
            setEligiendoIcono(false)
          }}
          onCerrar={() => setEligiendoIcono(false)}
        />
      )}
    </main>
  )
}
