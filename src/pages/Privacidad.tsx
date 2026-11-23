import { Link } from 'react-router-dom'
import { CAMBIOS_POLITICA, fechaLarga, ULTIMO_CAMBIO } from '../lib/politica'

const CONTACTO = 'facuprime24@gmail.com'
const ACTUALIZADA = fechaLarga(ULTIMO_CAMBIO.fecha)

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
          <b>Lo que cargás:</b> movimientos (montos, fechas, categorías, notas, etiquetas), cuentas y saldos, cuotas,
          inversiones, objetivos y presupuestos.
        </li>
        <li>
          <b>Deudas 1 a 1:</b> el nombre (o apodo) que le pongas a cada persona con la que registrás un préstamo. Es un
          dato tuyo: la persona no recibe nada ni tiene acceso. Usá solo lo necesario para reconocerla.
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

      <h2>Análisis con IA (opcional)</h2>
      <p>
        Si lo activás en “Análisis con IA”, la app arma un prompt y reportes mensuales para que los analices con la
        inteligencia artificial que elijas (ChatGPT, Gemini, Claude u otra). Al activarlo queda registrada la fecha.
      </p>
      <ul>
        <li>
          Los reportes incluyen montos, fechas, categorías, cuentas, inversiones, objetivos, presupuestos, tus etiquetas y
          el nombre de tus grupos. No incluyen las notas de los movimientos, los nombres de los miembros de tus grupos ni
          los de las personas de tus deudas (van como “Persona 1”, “Persona 2”), ni tu email.
        </li>
        <li>
          La app no se conecta con ninguna IA: los archivos se generan en tu dispositivo y solo salen si vos los descargás
          o copiás y se los mandás.
        </li>
        <li>
          Lo que le mandes a una IA queda en manos de esa empresa y sujeto a sus condiciones de uso y privacidad, no a
          las de esta app. Revisá si usa tus conversaciones para entrenar sus modelos y cómo desactivarlo.
        </li>
        <li>Podés desactivarlo cuando quieras desde la misma pantalla.</li>
      </ul>

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
      <p>
        La demo no pide email ni ningún dato personal: usa datos de ejemplo y todo lo que se cargue en ella se borra a
        las 24 horas, o antes si salís de la demo.
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
      <p>
        Si esta política cambia, te avisamos dentro de la app con un resumen de qué cambió, y la fecha de actualización
        figura arriba. Historial de cambios:
      </p>
      <ul>
        {CAMBIOS_POLITICA.map((c) => (
          <li key={c.fecha}>
            <b>{fechaLarga(c.fecha)}:</b> {c.resumen}
          </li>
        ))}
      </ul>
    </main>
  )
}
