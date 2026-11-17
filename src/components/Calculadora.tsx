import { useEffect, useState } from 'react'
import { Delete, X } from 'lucide-react'
import { formatearNumero, montoAEditable, parseNumero } from '../lib/format'

type Op = '+' | '−' | '×' | '÷'
const OPS: Op[] = ['+', '−', '×', '÷']

/** Separa "1500,5+200×2" en números y operaciones. */
function partes(expr: string): (number | Op)[] | null {
  const out: (number | Op)[] = []
  let num = ''
  for (const ch of expr) {
    if ((OPS as string[]).includes(ch)) {
      if (!num) return null
      const n = parseNumero(num, 10)
      if (n === null && num !== '0') return null
      out.push(n ?? 0, ch as Op)
      num = ''
    } else num += ch
  }
  if (num) {
    const n = parseNumero(num, 10)
    if (n === null && !/^0+(,0*)?$/.test(num)) return null
    out.push(n ?? 0)
  }
  return out
}

/** Resultado respetando que × y ÷ van antes que + y −. */
export function calcular(expr: string): number | null {
  const p = partes(expr)
  if (!p || !p.length) return null
  if (typeof p[p.length - 1] !== 'number') p.pop()
  // Primero × y ÷.
  const sumas: (number | Op)[] = [p[0]]
  for (let i = 1; i < p.length; i += 2) {
    const op = p[i] as Op
    const n = p[i + 1] as number
    if (op === '×' || op === '÷') {
      const prev = sumas.pop() as number
      if (op === '÷' && n === 0) return null
      sumas.push(op === '×' ? prev * n : prev / n)
    } else sumas.push(op, n)
  }
  let total = sumas[0] as number
  for (let i = 1; i < sumas.length; i += 2) total = sumas[i] === '+' ? total + (sumas[i + 1] as number) : total - (sumas[i + 1] as number)
  return Math.round(total * 100) / 100
}

/** Muestra la cuenta con puntos de miles en cada número. */
function mostrar(expr: string) {
  return expr
    .split(/([+−×÷])/)
    .map((x) => ((OPS as string[]).includes(x) ? ` ${x} ` : formatearNumero(x, 10)))
    .join('')
}

export default function Calculadora({
  inicial,
  onUsar,
  onCerrar,
}: {
  inicial: string
  onUsar: (valor: string) => void
  onCerrar: () => void
}) {
  const [expr, setExpr] = useState(() => inicial.replace(/\./g, ''))
  const resultado = calcular(expr)
  const ultimo = expr.slice(-1)

  function tecla(t: string) {
    if ((OPS as string[]).includes(t)) {
      if (!expr) return
      // Cambiar la operación si ya había una al final.
      setExpr((OPS as string[]).includes(ultimo) ? expr.slice(0, -1) + t : expr + t)
      return
    }
    if (t === ',') {
      const tramo = expr.split(/[+−×÷]/).pop() ?? ''
      if (tramo.includes(',')) return
      setExpr(expr + (tramo === '' ? '0,' : ','))
      return
    }
    const tramo = expr.split(/[+−×÷]/).pop() ?? ''
    const decimales = tramo.includes(',') ? tramo.split(',')[1].length : 0
    if (decimales >= 2) return
    setExpr(expr + t)
  }

  useEffect(() => {
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCerrar()
      if (/^\d$/.test(e.key)) tecla(e.key)
      else if (e.key === ',' || e.key === '.') tecla(',')
      else if (e.key === '+') tecla('+')
      else if (e.key === '-') tecla('−')
      else if (e.key === '*' || e.key === 'x') tecla('×')
      else if (e.key === '/') tecla('÷')
      else if (e.key === 'Backspace') setExpr((x) => x.slice(0, -1))
      else if (e.key === 'Enter' && resultado !== null && resultado > 0) onUsar(montoAEditable(resultado, 2))
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', teclado)
    return () => window.removeEventListener('keydown', teclado)
  })

  const teclas = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', ',', '0', '⌫', '+']

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja calculadora" role="dialog" aria-modal="true" aria-label="Calculadora" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-cabecera">
          <h2>Calculadora</h2>
          <button className="boton-icono" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="calc-pantalla" aria-live="polite">
          <div className="calc-expr">{expr ? mostrar(expr) : <span className="muted">Ej.: 1.500 + 2.300</span>}</div>
          <div className="calc-resultado">
            {resultado !== null && (OPS as string[]).some((o) => expr.includes(o)) ? `= ${montoAEditable(resultado, 2)}` : ' '}
          </div>
        </div>
        <div className="calc-teclas">
          {teclas.map((t) => (
            <button
              key={t}
              type="button"
              className={`calc-tecla ${(OPS as string[]).includes(t) ? 'op' : ''}`}
              onClick={() => (t === '⌫' ? setExpr(expr.slice(0, -1)) : tecla(t))}
              aria-label={t === '⌫' ? 'Borrar' : t === '−' ? 'Menos' : t === '×' ? 'Por' : t === '÷' ? 'Dividido' : t}
            >
              {t === '⌫' ? <Delete size={20} /> : t}
            </button>
          ))}
        </div>
        <div className="calc-acciones">
          <button type="button" className="secundario" onClick={() => setExpr('')}>
            Borrar todo
          </button>
          <button
            type="button"
            className="primary"
            disabled={resultado === null || resultado <= 0}
            onClick={() => resultado !== null && onUsar(montoAEditable(resultado, 2))}
          >
            {resultado !== null && resultado > 0 ? `Usar ${montoAEditable(resultado, 2)}` : 'Usar'}
          </button>
        </div>
      </div>
    </div>
  )
}
