import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { Calculator } from 'lucide-react'
import { formatearNumero } from '../lib/format'
import Calculadora from './Calculadora'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: string
  onChange: (valor: string) => void
  /** Decimales permitidos (montos: 2; cantidades: hasta 10). */
  decimales?: number
  /** Muestra un botón de calculadora para sumar varios gastos. */
  calculadora?: boolean
}

/**
 * Campo numérico que pone el punto de miles mientras escribís (1.500.000,50).
 * La coma es el decimal; si el teclado solo tiene punto, el punto que escribís
 * también se toma como coma decimal.
 */
export default function InputNumero({ value, onChange, decimales = 2, calculadora = false, ...resto }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [calc, setCalc] = useState(false)
  const cursor = useRef<number | null>(null)
  const mostrado = formatearNumero(value, decimales)

  useLayoutEffect(() => {
    if (cursor.current === null || !ref.current || document.activeElement !== ref.current) return
    ref.current.setSelectionRange(cursor.current, cursor.current)
    cursor.current = null
  })

  function cambiar(e: React.ChangeEvent<HTMLInputElement>) {
    let crudo = e.target.value
    let pos = e.target.selectionStart ?? crudo.length
    // Un punto recién escrito (cuando todavía no hay coma) es la coma decimal.
    const puntosAntes = (mostrado.match(/\./g) ?? []).length
    const puntosAhora = (crudo.match(/\./g) ?? []).length
    if (decimales > 0 && !crudo.includes(',') && puntosAhora > puntosAntes && crudo[pos - 1] === '.') {
      crudo = `${crudo.slice(0, pos - 1)},${crudo.slice(pos)}`
    }
    // Cuántos dígitos (y coma) quedan a la izquierda del cursor, para ubicarlo después de formatear.
    const significativos = crudo.slice(0, pos).replace(/[^\d,]/g, '').length
    const nuevo = formatearNumero(crudo, decimales)
    let vistos = 0
    pos = 0
    while (pos < nuevo.length && vistos < significativos) {
      if (/[\d,]/.test(nuevo[pos])) vistos++
      pos++
    }
    cursor.current = pos
    onChange(nuevo)
  }

  const input = <input ref={ref} inputMode="decimal" autoComplete="off" {...resto} value={mostrado} onChange={cambiar} />
  if (!calculadora) return input
  return (
    <span className="con-calculadora">
      {input}
      <button type="button" className="boton-calc" onClick={() => setCalc(true)} aria-label="Abrir calculadora">
        <Calculator size={20} strokeWidth={1.9} />
      </button>
      {calc && (
        <Calculadora
          inicial={mostrado}
          onUsar={(v) => {
            onChange(formatearNumero(v, decimales))
            setCalc(false)
          }}
          onCerrar={() => setCalc(false)}
        />
      )}
    </span>
  )
}
