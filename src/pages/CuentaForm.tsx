import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Combobox from '../components/Combobox'
import { TIPOS_CUENTA, useCuentas, useSaldosIniciales, type TipoCuenta } from '../lib/datos'
import { montoAEditable, parseMonto } from '../lib/format'
import { MONEDAS, nombreMoneda } from '../lib/monedas'
import { usePerfil } from '../lib/perfil'
import { supabase } from '../lib/supabase'
import InputNumero from '../components/InputNumero'

type Tarjeta = { id: string | null; nombre: string; activa: boolean }

/**
 * Alta y edición de una cuenta en una sola pantalla: nombre, tipo, saldo en cada
 * moneda y sus tarjetas de crédito.
 */
export default function CuentaForm() {
  const { id } = useParams()
  const editando = Boolean(id)
  const navigate = useNavigate()
  const { perfil } = usePerfil()
  const { cuentas, loading: cargandoCuentas } = useCuentas()
  const { saldos, loading: cargandoSaldos } = useSaldosIniciales()
  const favoritas = perfil?.monedas_favoritas ?? ['ARS', 'USD']

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('banco')
  const [activa, setActiva] = useState(true)
  const [monedas, setMonedas] = useState<string[]>(favoritas.slice(0, 2))
  const [textoSaldo, setTextoSaldo] = useState<Record<string, string>>({})
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState(!editando)

  // Al editar, precargar la cuenta, sus saldos y sus tarjetas.
  useEffect(() => {
    if (!editando || cargandoCuentas || cargandoSaldos || listo) return
    const c = cuentas.find((x) => x.id === id)
    if (!c) {
      setError('No se encontró la cuenta.')
      setListo(true)
      return
    }
    setNombre(c.nombre)
    setTipo(c.tipo)
    setActiva(c.activa)
    const propios = saldos.filter((x) => x.cuenta_id === c.id)
    setMonedas([...new Set([...favoritas.slice(0, 2), ...propios.map((x) => x.moneda)])])
    setTextoSaldo(Object.fromEntries(propios.map((x) => [x.moneda, montoAEditable(x.monto)])))
    setTarjetas(
      cuentas
        .filter((x) => x.cuenta_padre_id === c.id)
        .map((x) => ({ id: x.id, nombre: x.nombre, activa: x.activa })),
    )
    setListo(true)
  }, [editando, cargandoCuentas, cargandoSaldos, listo, cuentas, saldos, id, favoritas])

  const puedeTenerTarjetas = tipo === 'banco' || tipo === 'billetera'
  const tieneSaldo = tipo !== 'tarjeta'

  function agregarTarjeta() {
    const base = nombre.trim() ? `Tarjeta ${nombre.trim()}` : 'Tarjeta de crédito'
    setTarjetas([...tarjetas, { id: null, nombre: tarjetas.length ? `${base} ${tarjetas.length + 1}` : base, activa: true }])
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const nom = nombre.trim()
    if (!nom) return setError('Poné un nombre a la cuenta.')

    // Validar saldos antes de tocar la base.
    const filas: { moneda: string; monto: number }[] = []
    const borrar: string[] = []
    if (tieneSaldo) {
      for (const m of monedas) {
        const t = (textoSaldo[m] ?? '').trim()
        if (!t || t === '0') {
          borrar.push(m)
          continue
        }
        const v = parseMonto(t)
        if (!v) return setError(`El saldo en ${m} no es un número válido. Ejemplo: 150.000 o 150000,50`)
        filas.push({ moneda: m, monto: v })
      }
    }
    if (tarjetas.some((t) => !t.nombre.trim())) return setError('Cada tarjeta necesita un nombre.')

    setBusy(true)
    try {
      // 1) La cuenta.
      let cuentaId = id ?? null
      if (editando) {
        const { error } = await supabase.from('cuentas').update({ nombre: nom, tipo, activa }).eq('id', id!)
        if (error) throw error
      } else {
        const orden = cuentas.reduce((max, c) => Math.max(max, c.orden), 0) + 1
        const { data, error } = await supabase.from('cuentas').insert({ nombre: nom, tipo, orden }).select('id').single()
        if (error) throw error
        cuentaId = data.id as string
      }

      // 2) Saldos por moneda.
      if (filas.length) {
        const { error } = await supabase
          .from('saldos_iniciales')
          .upsert(filas.map((f) => ({ ...f, cuenta_id: cuentaId })), { onConflict: 'cuenta_id,moneda' })
        if (error) throw error
      }
      for (const m of borrar) {
        if (!saldos.some((x) => x.cuenta_id === cuentaId && x.moneda === m)) continue
        const { error } = await supabase.from('saldos_iniciales').delete().eq('cuenta_id', cuentaId!).eq('moneda', m)
        if (error) throw error
      }

      // 3) Tarjetas de crédito de esta cuenta.
      if (puedeTenerTarjetas) {
        for (const t of tarjetas) {
          const datos = { nombre: t.nombre.trim(), activa: t.activa }
          const { error } = t.id
            ? await supabase.from('cuentas').update(datos).eq('id', t.id)
            : await supabase.from('cuentas').insert({ ...datos, tipo: 'tarjeta', cuenta_padre_id: cuentaId })
          if (error) throw error
        }
      }
      navigate('/ajustes/cuentas')
    } catch (err) {
      const e = err as { code?: string; message?: string }
      setError(e.code === '23505' ? 'Ya tenés una cuenta o tarjeta con ese nombre.' : `No se pudo guardar: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!listo) return <main className="screen center muted">Cargando…</main>

  return (
    <main className="screen">
      <header className="topbar">
        <button className="link" onClick={() => navigate(-1)}>
          ← Volver
        </button>
        <h1 className="titulo-chico">{editando ? 'Editar cuenta' : 'Nueva cuenta'}</h1>
        <span style={{ width: 64 }} />
      </header>

      <form className="card formulario" onSubmit={guardar}>
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={40}
            placeholder="Ej.: Galicia, Mercado Pago, Efectivo"
            autoFocus={!editando}
          />
        </label>

        <div className="grupo">
          <span className="grupo-titulo">Tipo</span>
          <div className="chips">
            {TIPOS_CUENTA.map((t) => (
              <button
                type="button"
                key={t.valor}
                className="chip"
                aria-pressed={tipo === t.valor}
                onClick={() => setTipo(t.valor)}
              >
                {t.texto}
              </button>
            ))}
          </div>
        </div>

        {tieneSaldo && (
          <div className="grupo">
            <span className="grupo-titulo">Saldo al empezar</span>
            <small className="muted">Lo que había en la cuenta antes de tu primer movimiento cargado.</small>
            <div className="saldo-monedas">
              {monedas.map((m) => (
                <label key={m} className="saldo-moneda">
                  <span>
                    {m} <span className="muted chico">{nombreMoneda(m)}</span>
                  </span>
                  <InputNumero
                    placeholder="0"
                    value={textoSaldo[m] ?? ''}
                    onChange={(v) => setTextoSaldo({ ...textoSaldo, [m]: v })}
                  />
                </label>
              ))}
            </div>
            <Combobox
              etiqueta="Agregar otra moneda"
              opciones={MONEDAS.filter((m) => !monedas.includes(m.codigo)).map((m) => ({
                valor: m.codigo,
                texto: m.codigo,
                detalle: m.nombre,
              }))}
              valor={null}
              onCambio={(c) => setMonedas([...monedas, c])}
              placeholder="Buscar: euro, real…"
            />
          </div>
        )}

        {puedeTenerTarjetas && (
          <div className="grupo">
            <span className="grupo-titulo">Tarjetas de crédito de esta cuenta</span>
            {tarjetas.map((t, i) => (
              <div key={t.id ?? `nueva-${i}`} className="tarjeta-fila">
                <input
                  value={t.nombre}
                  maxLength={40}
                  onChange={(e) => setTarjetas(tarjetas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  aria-label="Nombre de la tarjeta"
                />
                {t.id ? (
                  <label className="interruptor">
                    <input
                      type="checkbox"
                      checked={t.activa}
                      onChange={(e) =>
                        setTarjetas(tarjetas.map((x, j) => (j === i ? { ...x, activa: e.target.checked } : x)))
                      }
                    />
                    <span>{t.activa ? 'Activa' : 'Oculta'}</span>
                  </label>
                ) : (
                  <button
                    type="button"
                    className="icono"
                    onClick={() => setTarjetas(tarjetas.filter((_, j) => j !== i))}
                    aria-label="Quitar tarjeta"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="secundario" onClick={agregarTarjeta}>
              + Agregar tarjeta de crédito
            </button>
          </div>
        )}

        {editando && (
          <label className="check">
            <input type="checkbox" checked={!activa} onChange={(e) => setActiva(!e.target.checked)} />
            <span>Ocultar esta cuenta (sus movimientos se conservan)</span>
          </label>
        )}

        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear cuenta'}
        </button>
      </form>
    </main>
  )
}
