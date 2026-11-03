import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabaseMissingConfig } from './lib/supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import Privacidad from './pages/Privacidad'

export default function App() {
  const { session, loading } = useAuth()

  if (supabaseMissingConfig) {
    return (
      <main className="screen center">
        <h1>Falta configurar Supabase</h1>
        <p className="muted">
          Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver README).
        </p>
      </main>
    )
  }

  if (loading) {
    return <main className="screen center muted">Cargando…</main>
  }

  return (
    <Routes>
      <Route path="/privacidad" element={<Privacidad />} />
      <Route path="/ingresar" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={session ? <Home /> : <Navigate to="/ingresar" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
