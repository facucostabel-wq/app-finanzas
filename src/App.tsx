import type React from 'react'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { usePerfil } from './lib/perfil'
import { missingVars, supabaseMissingConfig } from './lib/supabase'
import Ajustes from './pages/Ajustes'
import Consentimiento from './pages/Consentimiento'
import GastoGrupoForm from './pages/GastoGrupoForm'
import GrupoDetalle from './pages/GrupoDetalle'
import Grupos from './pages/Grupos'
import Unirse from './pages/Unirse'
import CuentaForm from './pages/CuentaForm'
import Home from './pages/Home'
import Inversiones from './pages/Inversiones'
import Login from './pages/Login'
import MovimientoForm from './pages/MovimientoForm'
import Movimientos from './pages/Movimientos'
import Privacidad from './pages/Privacidad'

export default function App() {
  const { session, loading } = useAuth()
  const { perfil, loading: perfilLoading } = usePerfil()
  const location = useLocation()
  const navigate = useNavigate()

  // Si alguien abre un link (ej. invitación a un grupo) sin estar logueado, se guarda
  // adónde iba y se lo lleva ahí después de ingresar.
  useEffect(() => {
    if (!session && location.pathname.startsWith('/unirse/')) {
      try {
        sessionStorage.setItem('volver_a', location.pathname)
      } catch {
        /* sin almacenamiento */
      }
    }
    if (session) {
      let destino: string | null = null
      try {
        destino = sessionStorage.getItem('volver_a')
        sessionStorage.removeItem('volver_a')
      } catch {
        /* sin almacenamiento */
      }
      if (destino && destino !== location.pathname) navigate(destino, { replace: true })
    }
  }, [session, location.pathname, navigate])

  if (supabaseMissingConfig) {
    return (
      <main className="screen center">
        <h1>Falta configurar Supabase</h1>
        <p className="muted">Faltan estas variables en Vercel: {missingVars.join(' y ')}.</p>
        <p className="muted">Versión publicada: {__BUILD_ID__}</p>
      </main>
    )
  }

  if (loading || (session && perfilLoading)) {
    return <main className="screen center muted">Cargando…</main>
  }

  // Logueado pero sin consentimiento registrado (p. ej. primera vez con Google).
  const faltaConsentimiento = session && !perfil?.consentimiento_at
  const protegida = (pagina: React.ReactNode) =>
    !session ? <Navigate to="/ingresar" replace /> : faltaConsentimiento ? <Consentimiento /> : pagina

  return (
    <Routes>
      <Route path="/privacidad" element={<Privacidad />} />
      <Route path="/ingresar" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={protegida(<Home />)} />
      <Route path="/movimientos" element={protegida(<Movimientos />)} />
      <Route path="/nuevo" element={protegida(<MovimientoForm key="nuevo" />)} />
      <Route path="/movimiento/:id" element={protegida(<MovimientoForm />)} />
      <Route path="/inversiones" element={protegida(<Inversiones />)} />
      <Route path="/ajustes" element={protegida(<Ajustes />)} />
      <Route path="/grupos" element={protegida(<Grupos />)} />
      <Route path="/grupos/:id" element={protegida(<GrupoDetalle />)} />
      <Route path="/grupos/:id/gasto/:gastoId" element={protegida(<GastoGrupoForm />)} />
      <Route path="/unirse/:token" element={protegida(<Unirse />)} />
      <Route path="/cuentas/nueva" element={protegida(<CuentaForm key="nueva" />)} />
      <Route path="/cuentas/:id" element={protegida(<CuentaForm />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
