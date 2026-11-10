import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { Categoria } from '../lib/datos'
import IconoCategoria, { ICONOS, iconoPara } from './IconoCategoria'

/** Hoja para elegir el ícono de una categoría. */
export default function SelectorIcono({
  categoria,
  onElegir,
  onCerrar,
}: {
  categoria: Categoria
  onElegir: (icono: string | null) => void
  onCerrar: () => void
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  const Auto = iconoPara(categoria.nombre, categoria.tipo)
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-labelledby="sel-icono-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cabecera">
          <h2 id="sel-icono-titulo">Ícono de {categoria.nombre}</h2>
          <button className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="grilla-iconos">
          <button
            className={`opcion-icono ${!categoria.icono ? 'elegido' : ''}`}
            onClick={() => onElegir(null)}
            aria-pressed={!categoria.icono}
          >
            <span className="icono-cat">
              <Auto size={21} strokeWidth={1.9} />
            </span>
            <span>Automático</span>
          </button>
          {Object.entries(ICONOS).map(([clave, { nombre }]) => (
            <button
              key={clave}
              className={`opcion-icono ${categoria.icono === clave ? 'elegido' : ''}`}
              onClick={() => onElegir(clave)}
              aria-pressed={categoria.icono === clave}
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
