import type React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Paso = {
  titulo: string
  texto: React.ReactNode
  icono: React.ReactNode
  accion?: { texto: string; a: string }
}

const Icono = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

const PASOS: Paso[] = [
  {
    titulo: 'Bienvenido',
    icono: (
      <Icono>
        <path d="M3 17l5-5 4 4 8-8" />
        <path d="M14 8h6v6" />
      </Icono>
    ),
    texto: (
      <>
        <p>Acá registrás tus gastos, ingresos e inversiones, y dividís gastos con amigos.</p>
        <p>Lo que cargás es tuyo. En un grupo, los demás ven solo los gastos de ese grupo.</p>
      </>
    ),
  },
  {
    titulo: '1. Cargá tus cuentas',
    icono: (
      <Icono>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18M7 15h3" />
      </Icono>
    ),
    texto: (
      <>
        <p>
          En <b>Ajustes → Cuentas</b> sumá cada banco, billetera, efectivo o broker, con el saldo que tiene hoy en cada moneda.
        </p>
        <p>Las tarjetas de crédito se agregan dentro del banco al que pertenecen.</p>
      </>
    ),
    accion: { texto: 'Ir a mis cuentas', a: '/ajustes/cuentas' },
  },
  {
    titulo: '2. Anotá cada movimiento',
    icono: (
      <Icono>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </Icono>
    ),
    texto: (
      <>
        <p>
          Con el botón <b>+</b> elegís qué fue: <b>Gasto</b>, <b>Ingreso</b>, <b>Inversión</b> o <b>Transferir</b> entre tus cuentas.
        </p>
        <p>Si pagaste con tarjeta en cuotas, cargá el total y elegí las cuotas: la app las reparte mes a mes.</p>
      </>
    ),
  },
  {
    titulo: '3. Mirá el resumen',
    icono: (
      <Icono>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </Icono>
    ),
    texto: (
      <>
        <p>
          <b>Disponible</b> es la plata que tenés en bancos, billeteras y efectivo. Lo que gastás con tarjeta se descuenta cuando pagás el resumen.
        </p>
        <p>Abajo está el mes: cuánto entró, cuánto salió y en qué. Con “Ver por cuenta” ves el detalle.</p>
      </>
    ),
  },
  {
    titulo: '4. Dividí gastos en grupo',
    icono: (
      <Icono>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 19c0-3 3-5 6-5s6 2 6 5M15 14.5c3 0 6 1.5 6 4.5" />
      </Icono>
    ),
    texto: (
      <>
        <p>
          En <b>Grupos</b> creás un grupo, invitás por link (o sumás a alguien sin cuenta) y cargás quién pagó y cómo se divide.
        </p>
        <p>Lo que cargan los demás te queda para confirmar, y “Para quedar a mano” te dice quién le paga a quién.</p>
      </>
    ),
  },
  {
    titulo: '5. Seguí tus inversiones',
    icono: (
      <Icono>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v9l6 4" />
      </Icono>
    ),
    texto: (
      <>
        <p>
          Cada <b>Inversión</b> que cargás suma a <b>Inversiones</b>: cuánto tenés de cada activo y a qué precio promedio compraste.
        </p>
        <p>Si cargás la cantidad (ej. 10 CEDEARs), la app calcula la cotización a la que entraste.</p>
      </>
    ),
  },
]

const claveOculto = (uid: string) => `tutorial_oculto_${uid}`
const CLAVE_SESION = 'tutorial_visto'

const leer = (fn: () => string | null) => {
  try {
    return fn()
  } catch {
    return null
  }
}

/** Para reabrirlo desde Ajustes. */
export const abrirTutorial = () => window.dispatchEvent(new Event('abrir-tutorial'))

export default function Tutorial({ uid }: { uid: string }) {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(
    () => leer(() => localStorage.getItem(claveOculto(uid))) !== '1' && leer(() => sessionStorage.getItem(CLAVE_SESION)) !== '1',
  )
  const [paso, setPaso] = useState(0)
  const [noMostrar, setNoMostrar] = useState(() => leer(() => localStorage.getItem(claveOculto(uid))) === '1')

  const cerrar = useCallback(() => {
    try {
      sessionStorage.setItem(CLAVE_SESION, '1')
      if (noMostrar) localStorage.setItem(claveOculto(uid), '1')
      else localStorage.removeItem(claveOculto(uid))
    } catch {
      /* sin almacenamiento: vuelve a aparecer la próxima vez */
    }
    setAbierto(false)
  }, [noMostrar, uid])

  useEffect(() => {
    const abrir = () => {
      setPaso(0)
      setAbierto(true)
    }
    window.addEventListener('abrir-tutorial', abrir)
    return () => window.removeEventListener('abrir-tutorial', abrir)
  }, [])

  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar()
      if (e.key === 'ArrowRight') setPaso((p) => Math.min(p + 1, PASOS.length - 1))
      if (e.key === 'ArrowLeft') setPaso((p) => Math.max(p - 1, 0))
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, cerrar])

  if (!abierto) return null
  const p = PASOS[paso]
  const ultimo = paso === PASOS.length - 1

  return (
    <div className="tutorial-fondo" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo">
      <div className="tutorial">
        <button type="button" className="link tutorial-saltar" onClick={cerrar}>
          {ultimo ? 'Cerrar' : 'Saltar'}
        </button>
        <div className="tutorial-icono">{p.icono}</div>
        <h2 id="tutorial-titulo">{p.titulo}</h2>
        <div className="tutorial-texto">{p.texto}</div>
        {p.accion && (
          <button
            type="button"
            className="secundario"
            onClick={() => {
              cerrar()
              navigate(p.accion!.a)
            }}
          >
            {p.accion.texto}
          </button>
        )}

        <div className="tutorial-puntos" aria-label={`Paso ${paso + 1} de ${PASOS.length}`}>
          {PASOS.map((_, i) => (
            <button key={i} type="button" aria-label={`Ir al paso ${i + 1}`} className={i === paso ? 'activo' : ''} onClick={() => setPaso(i)} />
          ))}
        </div>

        <div className="tutorial-nav">
          <button type="button" className="secundario" onClick={() => setPaso(paso - 1)} disabled={paso === 0}>
            Atrás
          </button>
          <button type="button" className="primary" onClick={() => (ultimo ? cerrar() : setPaso(paso + 1))}>
            {ultimo ? 'Empezar' : 'Siguiente'}
          </button>
        </div>

        <label className="tutorial-check">
          <input type="checkbox" checked={noMostrar} onChange={(e) => setNoMostrar(e.target.checked)} />
          No volver a mostrar
        </label>
      </div>
    </div>
  )
}
