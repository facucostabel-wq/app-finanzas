import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './lib/auth'
import { PerfilProvider } from './lib/perfil'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PerfilProvider>
          <App />
        </PerfilProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Service worker mínimo: habilita instalar la app en el celular.
// No guarda datos financieros en caché (no hay modo offline por ahora).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
