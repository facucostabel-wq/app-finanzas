import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  ArrowLeftRight,
  CalendarCheck,
  HandCoins,
  House,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import CompartirApp from './CompartirApp'
import { useAuth } from '../lib/auth'
import { esDemo, salirDeDemo } from '../lib/demo'
import { desactivarPush } from '../lib/push'
import { supabase } from '../lib/supabase'

const SECCIONES = [
  { a: '/', texto: 'Resumen', Icono: House, end: true },
  { a: '/movimientos', texto: 'Movimientos', Icono: ArrowLeftRight },
  { a: '/objetivos', texto: 'Objetivos', Icono: Target },
  { a: '/grupos', texto: 'Grupos', Icono: Users },
  { a: '/inversiones', texto: 'Inversiones', Icono: TrendingUp },
  { a: '/deudas', texto: 'Deudas', Icono: HandCoins },
  { a: '/etiquetas', texto: 'Etiquetas y eventos', Icono: Tag },
  { a: '/cierre', texto: 'Cierre de mes', Icono: CalendarCheck },
  { a: '/ia', texto: 'Análisis con IA', Icono: Sparkles },
  { a: '/ajustes', texto: 'Ajustes', Icono: Settings },
]

/** Botón ☰ con el menú lateral de todas las secciones. */
export default function BotonMenu() {
  const [abierto, setAbierto] = useState(false)
  const { session } = useAuth()
  const demo = esDemo(session)
  const navigate = useNavigate()

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
            <CompartirApp variante="menu" />
            <button
              className="menu-enlace"
              onClick={async () => {
                if (demo) {
                  if (!window.confirm('Al salir se borra todo lo de la demo. ¿Salir?')) return
                  const err = await salirDeDemo()
                  if (err) return window.alert(`No se pudo salir de la demo: ${err}`)
                  navigate('/ingresar', { replace: true })
                  return
                }
                await desactivarPush()
                await supabase.auth.signOut()
              }}
            >
              <LogOut size={20} strokeWidth={1.8} aria-hidden="true" />
              {demo ? 'Salir de la demo' : 'Cerrar sesión'}
            </button>
          </nav>
        </div>
      )}
    </>
  )
}
