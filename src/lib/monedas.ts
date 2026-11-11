/** Principales monedas del mundo (ISO 4217), con nombre en castellano para el buscador. */
export const MONEDAS: { codigo: string; nombre: string }[] = [
  { codigo: 'ARS', nombre: 'Peso argentino' },
  { codigo: 'USD', nombre: 'Dólar estadounidense' },
  { codigo: 'EUR', nombre: 'Euro' },
  { codigo: 'BRL', nombre: 'Real brasileño' },
  { codigo: 'UYU', nombre: 'Peso uruguayo' },
  { codigo: 'CLP', nombre: 'Peso chileno' },
  { codigo: 'PYG', nombre: 'Guaraní paraguayo' },
  { codigo: 'BOB', nombre: 'Boliviano' },
  { codigo: 'PEN', nombre: 'Sol peruano' },
  { codigo: 'COP', nombre: 'Peso colombiano' },
  { codigo: 'MXN', nombre: 'Peso mexicano' },
  { codigo: 'VES', nombre: 'Bolívar venezolano' },
  { codigo: 'CAD', nombre: 'Dólar canadiense' },
  { codigo: 'GBP', nombre: 'Libra esterlina' },
  { codigo: 'CHF', nombre: 'Franco suizo' },
  { codigo: 'SEK', nombre: 'Corona sueca' },
  { codigo: 'NOK', nombre: 'Corona noruega' },
  { codigo: 'DKK', nombre: 'Corona danesa' },
  { codigo: 'PLN', nombre: 'Esloti polaco' },
  { codigo: 'CZK', nombre: 'Corona checa' },
  { codigo: 'HUF', nombre: 'Forinto húngaro' },
  { codigo: 'TRY', nombre: 'Lira turca' },
  { codigo: 'RUB', nombre: 'Rublo ruso' },
  { codigo: 'ILS', nombre: 'Nuevo séquel israelí' },
  { codigo: 'AED', nombre: 'Dírham de los Emiratos' },
  { codigo: 'SAR', nombre: 'Riyal saudí' },
  { codigo: 'ZAR', nombre: 'Rand sudafricano' },
  { codigo: 'EGP', nombre: 'Libra egipcia' },
  { codigo: 'JPY', nombre: 'Yen japonés' },
  { codigo: 'CNY', nombre: 'Yuan chino' },
  { codigo: 'HKD', nombre: 'Dólar de Hong Kong' },
  { codigo: 'KRW', nombre: 'Won surcoreano' },
  { codigo: 'INR', nombre: 'Rupia india' },
  { codigo: 'IDR', nombre: 'Rupia indonesia' },
  { codigo: 'THB', nombre: 'Baht tailandés' },
  { codigo: 'SGD', nombre: 'Dólar de Singapur' },
  { codigo: 'MYR', nombre: 'Ringgit malayo' },
  { codigo: 'PHP', nombre: 'Peso filipino' },
  { codigo: 'VND', nombre: 'Dong vietnamita' },
  { codigo: 'AUD', nombre: 'Dólar australiano' },
  { codigo: 'NZD', nombre: 'Dólar neozelandés' },
]

const POR_CODIGO = new Map(MONEDAS.map((m) => [m.codigo, m.nombre]))

export function nombreMoneda(codigo: string): string {
  return POR_CODIGO.get(codigo) ?? codigo
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** Busca por código ("brl") o por nombre ("real", "libra"), sin importar tildes. */
export function buscarMonedas(texto: string) {
  const q = sinTildes(texto.trim())
  if (!q) return MONEDAS
  return MONEDAS.filter((m) => m.codigo.toLowerCase().includes(q) || sinTildes(m.nombre).includes(q))
}

const CORTOS: Record<string, string> = {
  ARS: 'Pesos',
  USD: 'Dólares',
  EUR: 'Euros',
  BRL: 'Reales',
  UYU: 'Pesos uruguayos',
  CLP: 'Pesos chilenos',
  GBP: 'Libras',
}

/** Nombre corto para subdividir una cuenta: "Pesos", "Dólares"… (o el código). */
export function nombreCortoMoneda(codigo: string): string {
  return CORTOS[codigo] ?? codigo
}
