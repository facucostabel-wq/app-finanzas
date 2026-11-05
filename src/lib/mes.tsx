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
      <button onClick={() => setMes(moverMes(mes, -1))} aria-label="Mes anterior">‹</button>
      <span>{nombreMes(mes)}</span>
      <button onClick={() => setMes(moverMes(mes, 1))} aria-label="Mes siguiente" disabled={esActual}>›</button>
    </div>
  )
}
