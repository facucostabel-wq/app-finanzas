import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type Opcion = {
  valor: string
  texto: string
  /** Texto secundario (p. ej. el nombre de la moneda). También se usa para buscar. */
  detalle?: string
  /** Encabezado del grupo al que pertenece (p. ej. "Favoritas"). */
  grupo?: string
}

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Lista desplegable con buscador: al tocar el campo se despliegan las opciones
 * y se van filtrando a medida que se escribe (sin importar tildes ni mayúsculas).
 */
export default function Combobox({
  etiqueta,
  opciones,
  valor,
  onCambio,
  placeholder = 'Buscar…',
  onCrear,
  textoVacio = 'Sin resultados',
}: {
  etiqueta: string
  opciones: Opcion[]
  valor: string | null
  onCambio: (valor: string) => void
  placeholder?: string
  /** Si se pasa, ofrece crear una opción nueva con lo escrito cuando no hay coincidencia exacta. */
  onCrear?: (texto: string) => Promise<string | null>
  textoVacio?: string
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [activo, setActivo] = useState(0)
  const [creando, setCreando] = useState(false)

  const seleccionada = opciones.find((o) => o.valor === valor)

  const filtradas = useMemo(() => {
    const q = normalizar(texto.trim())
    if (!q) return opciones
    return opciones.filter((o) => normalizar(`${o.valor} ${o.texto} ${o.detalle ?? ''}`).includes(q))
  }, [opciones, texto])

  const textoLimpio = texto.trim()
  const puedeCrear =
    Boolean(onCrear) && textoLimpio.length > 0 && !opciones.some((o) => normalizar(o.texto) === normalizar(textoLimpio))
  const total = filtradas.length + (puedeCrear ? 1 : 0)

  function abrir() {
    setTexto('')
    setActivo(Math.max(0, filtradas.findIndex((o) => o.valor === valor)))
    setAbierto(true)
    // Deja lugar para la lista por encima del teclado del celular.
    setTimeout(() => inputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250)
  }

  function cerrar() {
    setAbierto(false)
    setTexto('')
  }

  function elegir(v: string) {
    onCambio(v)
    cerrar()
    inputRef.current?.blur()
  }

  async function crear() {
    if (!onCrear || creando) return
    setCreando(true)
    const nuevo = await onCrear(textoLimpio)
    setCreando(false)
    if (nuevo) elegir(nuevo)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      abrir()
      e.preventDefault()
      return
    }
    if (e.key === 'ArrowDown') {
      setActivo((a) => Math.min(a + 1, total - 1))
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      setActivo((a) => Math.max(a - 1, 0))
      e.preventDefault()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activo < filtradas.length) elegir(filtradas[activo].valor)
      else if (puedeCrear) crear()
    } else if (e.key === 'Escape') {
      cerrar()
      inputRef.current?.blur()
    }
  }

  let grupoAnterior: string | undefined

  return (
    <div className="combo">
      <label htmlFor={`${id}-input`} className="grupo-titulo">
        {etiqueta}
      </label>
      <div className="combo-campo">
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          autoComplete="off"
          value={abierto ? texto : seleccionada ? seleccionada.texto : ''}
          placeholder={abierto ? placeholder : 'Elegir…'}
          onFocus={abrir}
          onBlur={cerrar}
          onChange={(e) => {
            setTexto(e.target.value)
            setActivo(0)
          }}
          onKeyDown={onKeyDown}
        />
        {!abierto && seleccionada?.detalle && <span className="combo-detalle">{seleccionada.detalle}</span>}
        <span className="combo-flecha" aria-hidden="true">
          ▾
        </span>
      </div>

      {abierto && (
        <ul id={`${id}-lista`} role="listbox" className="combo-lista" aria-label={etiqueta}>
          {filtradas.map((o, i) => {
            const encabezado = o.grupo && o.grupo !== grupoAnterior ? o.grupo : null
            grupoAnterior = o.grupo
            return (
              <li key={o.valor} role="presentation">
                {encabezado && <div className="combo-grupo">{encabezado}</div>}
                <div
                  role="option"
                  aria-selected={o.valor === valor}
                  className={`combo-opcion ${i === activo ? 'activa' : ''}`}
                  // pointerdown evita que el input pierda el foco antes de elegir.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o.valor)}
                >
                  <span>{o.texto}</span>
                  {o.detalle && <span className="muted">{o.detalle}</span>}
                  {o.valor === valor && <span className="combo-check">✓</span>}
                </div>
              </li>
            )
          })}
          {puedeCrear && (
            <li role="presentation">
              <div
                role="option"
                aria-selected={false}
                className={`combo-opcion crear ${activo === filtradas.length ? 'activa' : ''}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={crear}
              >
                {creando ? 'Creando…' : `+ Crear "${textoLimpio}"`}
              </div>
            </li>
          )}
          {total === 0 && <li className="combo-vacio muted">{textoVacio}</li>}
        </ul>
      )}
    </div>
  )
}
