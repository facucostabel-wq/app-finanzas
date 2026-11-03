import { Link } from 'react-router-dom'

// BORRADOR: versión inicial para la etapa de pruebas. Se revisa en la etapa 5
// (seguridad y legal) antes de invitar a otras personas.
export default function Privacidad() {
  return (
    <main className="screen prose">
      <p>
        <Link to="/">← Volver</Link>
      </p>
      <h1>Política de privacidad</h1>
      <p className="muted">Borrador — versión de prueba.</p>

      <h2>Qué datos guardamos</h2>
      <p>
        Tu nombre, tu email y los movimientos que cargues (montos, categorías, formas de pago, notas y gastos de
        grupo). No pedimos DNI, CBU ni números de tarjeta.
      </p>

      <h2>Para qué</h2>
      <p>Únicamente para que puedas registrar y analizar tus finanzas personales y dividir gastos con tus grupos.</p>

      <h2>Quién los ve</h2>
      <p>
        Tus movimientos personales los ves solo vos. Los gastos de un grupo los ven solo sus miembros. Los datos no
        se venden ni se comparten con terceros.
      </p>

      <h2>Dónde se alojan</h2>
      <p>
        En servidores de Supabase ubicados en la Unión Europea, región considerada con nivel de protección adecuado
        por la normativa argentina (Ley 25.326).
      </p>

      <h2>Tus derechos</h2>
      <p>
        Podés acceder, rectificar y suprimir tus datos en cualquier momento. La exportación y el borrado de cuenta
        desde la app se habilitan en una próxima versión; mientras tanto, pedíselo al responsable.
      </p>

      <h2>Responsable</h2>
      <p>Facundo Costabel — responsable de la base de datos.</p>
    </main>
  )
}
