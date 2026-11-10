import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { mesActual, moverMes, nombreMes, type Mes } from './format'

type MesState = { mes: Mes; setMes: (m: Mes) => void }

const MesContext = createContext<MesState>({ mes: mesActual(), setMes: () => {} })

/** Mes elegido, compartido entre Resumen y Movimientos. */
export function MesProvider({ children }: { children: ReactNode }) {
  const [mes, setMes] = useState<Mes>(mesActual())
  return <MesContext.Provider value={{ mes, setMes }}>{children}</MesContext.Provider>
}

export const useMes = () => useContext(MesContext)

export function SelectorMes() {
  const { mes, setMes } = useMes()
  const esActual = mes === mesActual()
  return (
    <div className="selector-mes">
      <button onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">
        <ChevronLeft size={22} strokeWidth={2} />
      </button>
      <span className="mes-actual">
        <CalendarDays size={20} strokeWidth={1.9} aria-hidden="true" />
        {nombreMes(mes)}
      </span>
      <button onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente" disabled={esActual}>
        <ChevronRight size={22} strokeWidth={2} />
      </button>
    </div>
  )
}
