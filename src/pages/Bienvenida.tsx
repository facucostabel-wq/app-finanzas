import { Link } from 'react-router-dom'
import { PlayCircle, UserPlus } from 'lucide-react'

/** Página del link compartido: elegir entre probar la demo o crear la cuenta. */
export default function Bienvenida() {
  return (
    <main className="screen bienvenida">
      <header className="brand">
        <img src="/icons/icon-192.png" alt="" width={56} height={56} />
        <h1>Finanzas</h1>
        <p className="muted">Anotá gastos e inversiones, seguí tus objetivos y dividí gastos con amigos.</p>
      </header>

      <div className="bienvenida-opciones">
        <Link to="/demo" className="bienvenida-opcion principal">
          <PlayCircle size={26} aria-hidden="true" />
          <span>
            <strong>Probar la demo</strong>
            <small>Con datos de ejemplo, sin email ni contraseña. Se borra sola a las 24 horas.</small>
          </span>
        </Link>
        <Link to="/ingresar?registrarse" className="bienvenida-opcion">
          <UserPlus size={26} aria-hidden="true" />
          <span>
            <strong>Crear cuenta</strong>
            <small>Arrancás directo con la tuya.</small>
          </span>
        </Link>
      </div>

      <p className="muted chico bienvenida-ingresar">
        ¿Ya tenés cuenta? <Link to="/ingresar">Ingresar</Link>
      </p>
    </main>
  )
}
