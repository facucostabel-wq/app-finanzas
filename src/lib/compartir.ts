/** Comparte el link de la app. Devuelve 'copiado' si no hubo menú de compartir y se copió el link. */
export async function compartirApp(): Promise<'compartido' | 'copiado' | 'cancelado' | 'error'> {
  const url = window.location.origin
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Finanzas',
        text: 'Te paso la app que uso para anotar gastos e inversiones y dividir gastos con amigos:',
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
    window.prompt('Copiá el link de la app:', url)
    return 'error'
  }
}
