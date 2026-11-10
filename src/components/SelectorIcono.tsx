import { useEffect } from 'react'
import { X } from 'lucide-react'
import IconoCategoria, { ICONOS, iconoPara } from './IconoCategoria'

/** Hoja para elegir un ícono (de una categoría o de un objetivo). */
export default function SelectorIcono({
  nombre,
  tipo,
  actual,
  onElegir,
  onCerrar,
}: {
  nombre: string
  tipo?: string
  actual: string | null
  onElegir: (icono: string | null) => void
  onCerrar: () => void
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const Auto = iconoPara(nombre, tipo)
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="sel-icono-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cabecera">
          <h2 id="sel-icono-titulo">Ícono de {nombre || 'tu objetivo'}</h2>
          <button className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="grilla-iconos">
          <button
            className={`opcion-icono ${!actual ? 'elegido' : ''}`}
            onClick={() => onElegir(null)}
            aria-pressed={!actual}
          >
            <span className="icono-cat">
              <Auto size={21} strokeWidth={1.9} />
            </span>
            <span>Automático</span>
          </button>
          {Object.entries(ICONOS).map(([clave, { nombre }]) => (
            <button
              key={clave}
              className={`opcion-icono ${actual === clave ? 'elegido' : ''}`}
              onClick={() => onElegir(clave)}
              aria-pressed={actual === clave}
            >
              <IconoCategoria icono={clave} />
              <span>{nombre}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
