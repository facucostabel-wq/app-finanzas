import { Link } from 'react-router-dom'

const CONTACTO = 'facuprime24@gmail.com'
const ACTUALIZADA = '10 de noviembre de 2026'

export default function Privacidad() {
  return (
    <main className="screen prose">
      <p>
        <Link to="/">← Volver</Link>
      </p>
      <h1>Política de privacidad</h1>
      <p className="muted">Última actualización: {ACTUALIZADA}</p>

      <p>
        Finanzas es una app personal, sin fines comerciales, que su responsable comparte con conocidos. Esta política
        explica qué datos guarda, para qué y qué podés hacer con ellos, según la Ley 25.326 de Protección de Datos
        Personales.
      </p>

      <h2>Responsable</h2>
      <p>
        Facundo Costabel. Contacto: <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.
      </p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>
          <b>Tu cuenta:</b> email, nombre y contraseña. La contraseña se guarda cifrada y nadie la puede ver, ni
          siquiera el responsable.
        </li>
        <li>
          <b>Lo que cargás:</b> movimientos (montos, fechas, categorías, notas), cuentas y saldos, cuotas e
          inversiones.
        </li>
        <li>
          <b>Grupos:</b> el nombre con el que figurás, los gastos, cómo se dividen y los pagos.
        </li>
        <li>
          <b>Datos técnicos:</b> si activás las notificaciones, un identificador de tu dispositivo para mandarlas; y
          los registros técnicos de acceso que guardan los proveedores (por ejemplo, la dirección IP).
        </li>
      </ul>
      <p>
        No pedimos DNI, CBU, CVU ni números de tarjeta. Te recomendamos no escribirlos en las notas.
      </p>

      <h2>Para qué los usamos</h2>
      <p>
        Solo para que la app funcione: mostrarte tus finanzas, dividir gastos con tus grupos, avisarte de novedades y
        mandarte los emails de la cuenta (confirmación y recuperación de contraseña). No se usan para publicidad, no se
        venden y no se comparten con nadie para otros fines.
      </p>

      <h2>Quién los ve</h2>
      <ul>
        <li>
          <b>Vos:</b> todos tus datos.
        </li>
        <li>
          <b>Los miembros de tus grupos:</b> solo lo del grupo (tu nombre, los gastos, divisiones y pagos). Nunca tus
          movimientos personales, cuentas ni saldos.
        </li>
        <li>
          <b>El responsable:</b> como administrador técnico tiene acceso a la base de datos. Se compromete a usarlo solo
          para mantener la app, resolver problemas o atender un pedido tuyo, y a no usar ni divulgar tus datos.
        </li>
      </ul>

      <h2>Proveedores</h2>
      <p>Para funcionar, la app usa estos servicios, que tratan los datos solo por cuenta del responsable:</p>
      <ul>
        <li>
          <b>Supabase:</b> base de datos y cuentas de usuario. Servidores en la Unión Europea, región con nivel de
          protección adecuado según la normativa argentina.
        </li>
        <li>
          <b>Vercel:</b> publica la app (no guarda tus datos financieros).
        </li>
        <li>
          <b>Brevo:</b> envía los emails de la cuenta (recibe tu email).
        </li>
        <li>
          <b>GitHub:</b> guarda los respaldos, cifrados con una clave que solo tiene el responsable.
        </li>
        <li>
          <b>Servicio de notificaciones de tu navegador</b> (Google, Apple o Mozilla): transporta los avisos, que viajan
          cifrados y no puede leer.
        </li>
      </ul>
      <p>
        Algunos de estos proveedores pueden procesar datos técnicos fuera de la Argentina. Al usar la app aceptás esa
        transferencia, limitada a lo necesario para que funcione.
      </p>

      <h2>Seguridad</h2>
      <p>
        La conexión es siempre cifrada (HTTPS), la base separa los datos de cada usuario y los respaldos se guardan
        cifrados. Ningún sistema es infalible: si ocurriera un incidente que afecte tus datos, te vamos a avisar.
      </p>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tengas la cuenta. Si la borrás, tus datos se eliminan en el momento; las copias de respaldo se borran
        solas a los 30 días. En los grupos compartidos, los gastos y pagos siguen existiendo para los demás miembros y
        vos pasás a figurar como invitado, solo con tu nombre.
      </p>

      <h2>Tus derechos</h2>
      <ul>
        <li>
          <b>Acceso:</b> descargá todos tus datos en <Link to="/ajustes/cuenta">Ajustes → Mi cuenta → Exportar mis datos</Link>.
        </li>
        <li>
          <b>Rectificación:</b> podés editar todo lo que cargaste desde la app.
        </li>
        <li>
          <b>Supresión:</b> borrá tu cuenta en <Link to="/ajustes/cuenta">Ajustes → Mi cuenta</Link>.
        </li>
      </ul>
      <p>
        También podés pedirlo por email a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>: respondemos los pedidos de
        acceso dentro de los 10 días corridos y los de rectificación o supresión dentro de los 5 días hábiles.
      </p>
      <p className="muted chico">
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
        gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo
        establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en
        su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que
        interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de
        protección de datos personales.
      </p>

      <h2>Edad</h2>
      <p>La app no está pensada para menores de 18 años.</p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, lo vas a ver en la app, con la fecha de actualización arriba.</p>
    </main>
  )
}
