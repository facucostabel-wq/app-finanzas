import { NavLink, useNavigate } from 'react-router-dom'
import { useNoLeidas } from '../lib/push'

export default function BottomNav() {
  const navigate = useNavigate()
  const { items } = useNoLeidas()
  const sinLeer = items.length
  return (
    <>
      <button className="fab" onClick={() => navigate('/nuevo')} aria-label="Cargar movimiento">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <nav className="bottomnav" aria-label="Navegación principal">
        <NavLink to="/" end>
          <Icono d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
          Resumen
        </NavLink>
        <NavLink to="/movimientos">
          <Icono d="M4 6h16M4 12h16M4 18h10" />
          Movimientos
        </NavLink>
        <NavLink to="/grupos" aria-label={sinLeer ? `Grupos, ${sinLeer} sin leer` : undefined}>
          <span className="nav-icono">
            <Icono d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            {sinLeer > 0 && <span className="nav-badge">{sinLeer > 9 ? '9+' : sinLeer}</span>}
          </span>
          Grupos
        </NavLink>
        <NavLink to="/inversiones">
          <Icono d="M3 17l6-6 4 4 8-8M15 7h6v6" />
          Inversiones
        </NavLink>
        <NavLink to="/ajustes">
          <Icono d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
          Ajustes
        </NavLink>
      </nav>
    </>
  )
}

function Icono({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
