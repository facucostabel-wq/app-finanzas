import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMonto, nombreMes } from '../lib/format'
import { Oculto } from '../lib/ocultar'
import { usePatrimonio, type Punto } from '../lib/patrimonio'

const usd = (n: number) => formatMonto(Math.round(n * 100) / 100, 'USD')
const mesCorto = (mes: string) => {
  const [n, y] = nombreMes(mes).split(' de ')
  return `${n.slice(0, 3).toLowerCase()} ${y?.slice(2) ?? ''}`
}

/** Evolución del patrimonio en dólares: un punto por cierre de mes y el de hoy. */
export default function Patrimonio() {
  const { puntos, loading, hayCierres } = usePatrimonio()
  const [elegido, setElegido] = useState<number | null>(null)
  const visibles = puntos.slice(-12)
  const idx = elegido ?? visibles.length - 1
  const actual = visibles[idx]
  const previo = idx > 0 ? visibles[idx - 1] : null
  const max = Math.max(1, ...visibles.map((p) => Math.abs(p.total)))

  return (
    <main className="screen patrimonio-pantalla">
      <header className="topbar">
        <Link to="/" className="link">
          ← Resumen
        </Link>
      </header>
      <h1>Patrimonio</h1>
      <p className="muted">
        Todo lo que tenés menos lo que debés, en dólares: un punto por cada cierre de mes (con sus cotizaciones y precios) y
        el de hoy.
      </p>
      {loading && !visibles.length ? (
        <p className="muted">Calculando…</p>
      ) : (
        <>
          {!hayCierres && (
            <p className="aviso">
              Todavía no cerraste ningún mes, así que solo se ve el de hoy. Cada <Link to="/cierre">cierre</Link> suma un punto
              al gráfico.
            </p>
          )}
          <div className="patrimonio-grafico" role="list" aria-label="Patrimonio por mes">
            {visibles.map((p, i) => (
              <button
                key={`${p.mes}-${p.esHoy}`}
                role="listitem"
                className={`patrimonio-columna ${i === idx ? 'elegida' : ''} ${p.esHoy ? 'hoy' : ''}`}
                onClick={() => setElegido(i)}
                aria-label={`${p.esHoy ? 'Hoy' : nombreMes(p.mes)}: ${usd(p.total)}`}
              >
                <span className="patrimonio-barra-pista">
                  <span
                    className={`patrimonio-barra ${p.total < 0 ? 'negativa' : ''}`}
                    style={{ height: `${Math.max(3, (Math.abs(p.total) / max) * 100)}%` }}
                  />
                </span>
                <span className="patrimonio-etiqueta">{p.esHoy ? 'hoy' : mesCorto(p.mes)}</span>
              </button>
            ))}
          </div>
          {actual && <Detalle punto={actual} previo={previo} />}
        </>
      )}
    </main>
  )
}

function Detalle({ punto, previo }: { punto: Punto; previo: Punto | null }) {
  const dif = previo ? punto.total - previo.total : null
  const pct = previo && Math.abs(previo.total) > 0.005 && dif !== null ? (dif / Math.abs(previo.total)) * 100 : null
  const filas: [string, number][] = [
    ['Bancos, billeteras y efectivo', punto.partes.disponible],
    ['Inversiones', punto.partes.inversiones],
    ['Sin invertir en brokers', punto.partes.broker],
    ['Tarjetas', punto.partes.tarjetas],
    ['Grupos y préstamos', punto.partes.deudas],
  ]
  return (
    <section className="card patrimonio-detalle">
      <p className="muted chico">{punto.esHoy ? 'Hoy' : `Cierre de ${nombreMes(punto.mes).toLowerCase()}`}</p>
      <p className="patrimonio-total">
        <Oculto>{usd(punto.total)}</Oculto>
      </p>
      {dif !== null && (
        <p className={`chico ${dif >= 0 ? 'positivo' : 'negativo'}`}>
          <Oculto>
            {dif >= 0 ? '+' : '−'}
            {usd(Math.abs(dif))}
          </Oculto>
          {pct !== null && ` (${pct >= 0 ? '+' : ''}${pct.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%)`} contra{' '}
          {previo!.esHoy ? 'hoy' : nombreMes(previo!.mes).split(' ')[0].toLowerCase()}
        </p>
      )}
      <dl>
        {filas
          .filter(([, v]) => Math.abs(v) >= 0.005)
          .map(([t, v]) => (
            <div key={t}>
              <dt>{t}</dt>
              <dd className={v < 0 ? 'negativo' : ''}>
                <Oculto>{usd(v)}</Oculto>
              </dd>
            </div>
          ))}
      </dl>
      {punto.sinConvertir && <p className="muted chico">Algún saldo en una moneda sin cotización quedó afuera.</p>}
      {punto.esHoy && <p className="muted chico">Las inversiones de hoy van con el último valor que cargaste de cada una.</p>}
    </section>
  )
}
