import { linkCompartir } from './demo'

/** Comparte el link de la app (abre la página para elegir demo o crear cuenta). Devuelve 'copiado' si no hubo menú de compartir y se copió el link. */
export async function compartirApp(): Promise<'compartido' | 'copiado' | 'cancelado' | 'error'> {
  const url = linkCompartir()
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Finanzas',
        text: 'Te paso la app que uso para anotar gastos e inversiones y dividir gastos con amigos. Podés probar la demo sin crear cuenta:',
        url,
      })
      return 'compartido'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelado'
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copiado'
  } catch {
    window.prompt('Copiá el link:', url)
    return 'error'
  }
}
