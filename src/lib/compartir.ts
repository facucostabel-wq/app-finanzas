import { linkDemo, linkRegistro } from './demo'

export type QueCompartir = 'demo' | 'registro'

const TEXTOS: Record<QueCompartir, string> = {
  demo: 'Probá la app que uso para anotar gastos e inversiones y dividir gastos con amigos. Es una demo con datos de ejemplo, no hace falta crear cuenta:',
  registro: 'Te paso la app que uso para anotar gastos e inversiones y dividir gastos con amigos. Creá tu cuenta acá:',
}

/** Comparte el link de la demo o el de crear cuenta. Devuelve 'copiado' si no hubo menú de compartir y se copió el link. */
export async function compartirApp(que: QueCompartir): Promise<'compartido' | 'copiado' | 'cancelado' | 'error'> {
  const url = que === 'demo' ? linkDemo() : linkRegistro()
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Finanzas', text: TEXTOS[que], url })
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
