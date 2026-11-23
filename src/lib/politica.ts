/**
 * Historial de cambios de la política de privacidad, del más nuevo al más viejo.
 * Al cambiar la política: sumar una entrada arriba. Los usuarios que ya la habían aceptado
 * ven un aviso con el resumen hasta que tocan "Entendido".
 */
export const CAMBIOS_POLITICA: { fecha: string; resumen: string }[] = [
  {
    fecha: '2026-11-23',
    resumen:
      'Sumamos "Análisis con IA" (opcional): qué datos incluyen los reportes, que solo salen de la app si vos los descargás o copiás, y que lo que le mandes a una IA queda sujeto a sus condiciones. También aclaramos que la demo no pide datos personales y se borra a las 24 horas, que te vamos a avisar de cada cambio, y sumamos los datos de presupuestos, etiquetas y deudas 1 a 1 (el nombre que le pongas a cada persona, que no va en los reportes para la IA).',
  },
]

export const ULTIMO_CAMBIO = CAMBIOS_POLITICA[0]

/** "2026-11-23" → "23 de noviembre de 2026". */
export const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
