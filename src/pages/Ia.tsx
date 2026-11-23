import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Download, Sparkles } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import BotonMenu from '../components/BotonMenu'
import { useCierres, useMepHistorico, useTiposHoy } from '../lib/cotizaciones'
import { armarReporte, copiarTexto, descargarTexto, useIaActiva } from '../lib/ia'
import { PROMPT_INICIAL } from '../lib/iaPrompt'
import { mesActual, moverMes, nombreMes } from '../lib/format'

/** Análisis con IA: prompt inicial (una vez) y reporte de cada mes, para usar con cualquier IA. */
export default function Ia() {
  const { activa, faltaSql, cambiar } = useIaActiva()
  const [params, setParams] = useSearchParams()
  const pedido = params.get('mes')
  const mes = pedido && /^\d{4}-\d{2}$/.test(pedido) && pedido <= mesActual() ? pedido : mesActual()
  const esActual = mes === mesActual()
  const { cierres } = useCierres()
  const tiposHoy = useTiposHoy(['USD'], cierres[0]?.tipos)
  const mepEn = useMepHistorico()
  const [busy, setBusy] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const avisar = (t: string) => {
    setAviso(t)
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 3000)
  }

  async function prompt(accion: 'descargar' | 'copiar') {
    setError(null)
    if (accion === 'descargar') return descargarTexto('finanzas-prompt-inicial.txt', PROMPT_INICIAL)
    if (await copiarTexto(PROMPT_INICIAL)) avisar('Prompt copiado: pegalo en un chat nuevo de tu IA.')
    else setError('No se pudo copiar. Probá con "Descargar".')
  }

  async function reporte(accion: 'descargar' | 'copiar') {
    setError(null)
    setBusy(accion)
    try {
      const texto = await armarReporte(mes, { mepEn, tiposHoy })
      if (accion === 'descargar') descargarTexto(`finanzas-reporte-${mes}.txt`, texto)
      else if (await copiarTexto(texto)) avisar(`Reporte de ${nombreMes(mes)} copiado.`)
      else setError('No se pudo copiar. Probá con "Descargar".')
    } catch (e) {
      setError(`No se pudo armar el reporte: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function activar(v: boolean) {
    setError(null)
    const err = await cambiar(v)
    if (err) setError(`No se pudo guardar: ${err}`)
  }

  const privacidad = (
    <section className="card ia-privacidad">
      <h2>Qué se comparte</h2>
      <ul>
        <li>
          <strong>Sí:</strong> montos, fechas, categorías, cuentas, inversiones, objetivos y el nombre de tus grupos.
        </li>
        <li>
          <strong>No:</strong> las notas de los movimientos, los nombres de los miembros de tus grupos ni tu email.
        </li>
        <li>
          Nada sale de la app hasta que vos descargues o copies un archivo y se lo mandes a la IA. Esa IA es de otra empresa: lo que le
          mandes queda sujeto a sus condiciones de uso y privacidad.
        </li>
      </ul>
      {activa === false && (
        <button className="primary boton-ancho" onClick={() => activar(true)} disabled={faltaSql}>
          <Sparkles size={18} aria-hidden="true" /> Entiendo, activar el análisis con IA
        </button>
      )}
    </section>
  )

  return (
    <main className="screen con-nav ia">
      <header className="topbar">
        <div className="topbar-izq">
          <BotonMenu />
          <h1>Análisis con IA</h1>
        </div>
      </header>

      <p className="muted">
        Exportá tus datos para analizarlos con la IA que uses: ChatGPT, Gemini, Claude, Copilot, DeepSeek u otra. La app arma los archivos;
        la conversación la tenés vos con tu IA.
      </p>

      {faltaSql && <p className="error chico">Falta actualizar la base (SQL 0020) para poder activar esta opción.</p>}

      {activa === false && privacidad}

      {activa && (
        <>
          <section className="card ia-instructivo">
            <h2>Cómo usarlo</h2>
            <ol>
              <li>
                <strong>Una sola vez:</strong> descargá el <em>prompt inicial</em> y mandalo en un chat nuevo de tu IA. Si tu IA tiene
                proyectos o asistentes (Proyectos en ChatGPT o Claude, Gems en Gemini), pegalo como instrucciones del proyecto.
              </li>
              <li>La IA te va a hacer unas preguntas para conocerte. Respondelas.</li>
              <li>
                <strong>Cada mes:</strong> después del cierre, descargá el <em>reporte del mes</em> y mandáselo al mismo chat o proyecto.
              </li>
              <li>
                Al terminar el análisis, la IA te devuelve una <strong>bitácora</strong> con tu histórico. Guardala y mandala el mes
                siguiente junto con el reporte nuevo: así no depende de su memoria ni inventa datos.
              </li>
            </ol>
            <p className="muted chico">Ejemplo de mensaje: “Te paso el reporte de noviembre y mi bitácora.”</p>
          </section>

          <section className="card ia-archivo">
            <h2>1. Prompt inicial</h2>
            <p className="muted chico">Le explica a la IA cómo leer tus datos, qué analizar y cómo llevar la bitácora.</p>
            <div className="ia-botones">
              <button className="primary" onClick={() => prompt('descargar')}>
                <Download size={18} aria-hidden="true" /> Descargar
              </button>
              <button className="secundario" onClick={() => prompt('copiar')}>
                <Copy size={18} aria-hidden="true" /> Copiar
              </button>
            </div>
          </section>

          <section className="card ia-archivo">
            <h2>2. Reporte del mes</h2>
            <div className="selector-mes">
              <button onClick={() => setParams({ mes: moverMes(mes, -1) }, { replace: true })} aria-label="Mes anterior">
                <ChevronLeft size={22} />
              </button>
              <span className="mes-actual">
                <CalendarDays size={20} aria-hidden="true" />
                {nombreMes(mes)}
              </span>
              <button
                onClick={() => setParams({ mes: moverMes(mes, 1) }, { replace: true })}
                aria-label="Mes siguiente"
                disabled={esActual}
              >
                <ChevronRight size={22} />
              </button>
            </div>
            <p className="muted chico">
              Resumen, gastos por categoría, histórico de 12 meses, saldos, inversiones, objetivos y el detalle de movimientos.
              {esActual && ' Es el mes en curso: el reporte va a estar incompleto.'}
            </p>
            <div className="ia-botones">
              <button className="primary" onClick={() => reporte('descargar')} disabled={busy !== null}>
                <Download size={18} aria-hidden="true" /> {busy === 'descargar' ? 'Armando…' : 'Descargar'}
              </button>
              <button className="secundario" onClick={() => reporte('copiar')} disabled={busy !== null}>
                <Copy size={18} aria-hidden="true" /> {busy === 'copiar' ? 'Armando…' : 'Copiar'}
              </button>
            </div>
          </section>

          {privacidad}
          <button className="link ia-desactivar" onClick={() => activar(false)}>
            Desactivar el análisis con IA
          </button>
        </>
      )}

      {aviso && (
        <p className="info" role="status">
          {aviso}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <BottomNav />
    </main>
  )
}
