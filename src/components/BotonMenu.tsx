import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarCheck,
  House,
  LogOut,
  Menu,
  Settings,
  Share2,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import { compartirApp } from '../lib/compartir'
import { desactivarPush } from '../lib/push'
import { supabase } from '../lib/supabase'

const SECCIONES = [
  { a: '/', texto: 'Resumen', Icono: House, end: true },
  { a: '/movimientos', texto: 'Movimientos', Icono: ArrowLeftRight },
  { a: '/objetivos', texto: 'Objetivos', Icono: Target },
  { a: '/grupos', texto: 'Grupos', Icono: Users },
  { a: '/inversiones', texto: 'Inversiones', Icono: TrendingUp },
  { a: '/cierre', texto: 'Cierre de mes', Icono: CalendarCheck },
  { a: '/ajustes', texto: 'Ajustes', Icono: Settings },
]

/** Botón ☰ con el menú lateral de todas las secciones. */
export default function BotonMenu() {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    window.addEventListener('keydown', tecla)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', tecla)
      document.body.style.overflow = ''
    }
  }, [abierto])

  return (
    <>
      <button className="boton-icono boton-menu" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto}>
        <Menu size={22} />
      </button>
      {abierto && (
        <div className="menu-fondo" onClick={() => setAbierto(false)}>
          <nav className="menu-lateral" aria-label="Menú" onClick={(e) => e.stopPropagation()}>
            <div className="menu-cabecera">
              <span className="menu-marca">Finanzas</span>
              <button className="boton-icono" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
                <X size={20} />
              </button>
            </div>
            {SECCIONES.map(({ a, texto, Icono, end }) => (
              <NavLink key={a} to={a} end={end} className="menu-enlace" onClick={() => setAbierto(false)}>
                <Icono size={20} strokeWidth={1.8} aria-hidden="true" />
                {texto}
              </NavLink>
            ))}
            <hr />
            <button
              className="menu-enlace"
              onClick={async () => {
                const r = await compartirApp()
                if (r === 'copiado') setAviso('Link copiado')
              }}
            >
              <Share2 size={20} strokeWidth={1.8} aria-hidden="true" />
              Compartir la app
            </button>
            {aviso && <p className="info chico menu-aviso">{aviso}</p>}
            <button
              className="menu-enlace"
              onClick={async () => {
                await desactivarPush()
                await supabase.auth.signOut()
              }}
            >
              <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
              Cerrar sesión
            </button>
          </nav>
        </div>
      )}
    </>
  )
}
