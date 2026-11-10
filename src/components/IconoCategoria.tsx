import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Beer,
  Bitcoin,
  BookOpen,
  Briefcase,
  Bus,
  Car,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  DollarSign,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  HeartPulse,
  House,
  Landmark,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  Sparkles,
  Music,
  Wifi,
  Pill,
  GraduationCap,
  Tv,
  type LucideIcon,
} from 'lucide-react'

/** Íconos que se pueden elegir para una categoría (la clave es lo que se guarda en la base). */
export const ICONOS: Record<string, { Icono: LucideIcon; nombre: string }> = {
  utensils: { Icono: Utensils, nombre: 'Comida' },
  coffee: { Icono: Coffee, nombre: 'Café' },
  beer: { Icono: Beer, nombre: 'Bar' },
  cart: { Icono: ShoppingCart, nombre: 'Súper' },
  bag: { Icono: ShoppingBag, nombre: 'Compras' },
  shirt: { Icono: Shirt, nombre: 'Ropa' },
  car: { Icono: Car, nombre: 'Auto' },
  fuel: { Icono: Fuel, nombre: 'Nafta' },
  bus: { Icono: Bus, nombre: 'Transporte' },
  plane: { Icono: Plane, nombre: 'Viajes' },
  house: { Icono: House, nombre: 'Casa' },
  zap: { Icono: Zap, nombre: 'Servicios' },
  wifi: { Icono: Wifi, nombre: 'Internet' },
  phone: { Icono: Smartphone, nombre: 'Celular' },
  tv: { Icono: Tv, nombre: 'TV' },
  clapperboard: { Icono: Clapperboard, nombre: 'Suscripciones' },
  music: { Icono: Music, nombre: 'Música' },
  gamepad: { Icono: Gamepad2, nombre: 'Juegos' },
  dumbbell: { Icono: Dumbbell, nombre: 'Gimnasio' },
  heart: { Icono: HeartPulse, nombre: 'Salud' },
  pill: { Icono: Pill, nombre: 'Farmacia' },
  scissors: { Icono: Scissors, nombre: 'Belleza' },
  book: { Icono: BookOpen, nombre: 'Libros' },
  graduation: { Icono: GraduationCap, nombre: 'Estudio' },
  paw: { Icono: PawPrint, nombre: 'Mascotas' },
  baby: { Icono: Baby, nombre: 'Chicos' },
  gift: { Icono: Gift, nombre: 'Regalos' },
  wrench: { Icono: Wrench, nombre: 'Arreglos' },
  sparkles: { Icono: Sparkles, nombre: 'Gustos' },
  users: { Icono: Users, nombre: 'Grupo' },
  landmark: { Icono: Landmark, nombre: 'Impuestos' },
  card: { Icono: CreditCard, nombre: 'Tarjeta' },
  receipt: { Icono: Receipt, nombre: 'Varios' },
  briefcase: { Icono: Briefcase, nombre: 'Trabajo' },
  wallet: { Icono: Wallet, nombre: 'Billetera' },
  banknote: { Icono: Banknote, nombre: 'Efectivo' },
  piggy: { Icono: PiggyBank, nombre: 'Ahorro' },
  trending: { Icono: TrendingUp, nombre: 'Inversión' },
  coins: { Icono: Coins, nombre: 'Monedas' },
  dollar: { Icono: DollarSign, nombre: 'Dólares' },
  bitcoin: { Icono: Bitcoin, nombre: 'Cripto' },
  transfer: { Icono: ArrowLeftRight, nombre: 'Transferencia' },
}

// Ícono según el nombre de la categoría (palabras clave). Si no coincide nada,
// uno genérico según el tipo de movimiento.
const REGLAS: [RegExp, LucideIcon][] = [
  [/nafta|combustible|ypf|shell|axion/, Fuel],
  [/auto|cochera|estacionamiento|peaje|patente|seguro del auto|mec[aá]nic/, Car],
  [/super|mercado|almac[eé]n|verduler|carnicer|diet[eé]tica/, ShoppingCart],
  [/caf[eé]/, Coffee],
  [/bar|birra|cerveza|boliche|fiesta/, Beer],
  [/salida|restaurant|resto|comida|delivery|cena|almuerzo|pedidos/, Utensils],
  [/suscrip|netflix|spotify|streaming|hbo|disney|youtube|prime/, Clapperboard],
  [/celular|tel[eé]fono|personal|claro|movistar|tuenti/, Smartphone],
  [/servicio|luz|gas|agua|internet|edenor|edesur|metrogas|aysa/, Zap],
  [/expensa|alquiler|casa|hogar|depto|departamento|vivienda/, House],
  [/gimnasio|gym|deporte|profe|entren|f[uú]tbol|padel|p[aá]del/, Dumbbell],
  [/salud|farmacia|m[eé]dic|prepaga|obra social|dentista|odont/, HeartPulse],
  [/ropa|indumentaria|zapatilla|calzado/, Shirt],
  [/compra|shopping|regal[aá]/, ShoppingBag],
  [/regalo/, Gift],
  [/viaje|vacaciones|vuelo|hotel|turismo/, Plane],
  [/educaci|curso|facultad|universidad|libro|estudio/, BookOpen],
  [/transporte|sube|uber|cabify|taxi|colectivo|subte|tren/, Bus],
  [/mascota|perro|gato|veterinari/, PawPrint],
  [/peluquer|barber|est[eé]tica|belleza/, Scissors],
  [/juego|gaming|steam|playstation/, Gamepad2],
  [/beb[eé]|hijo|ni[ñn]/, Baby],
  [/arreglo|reparaci|mantenimiento|ferreter/, Wrench],
  [/pr[eé]stamo|cuota|deuda|impuesto|afip|arca|rentas|abl/, Landmark],
  [/tarjeta/, CreditCard],
  [/sueldo|salario|aguinaldo|honorario|freelance|trabajo/, Briefcase],
  [/bitcoin|btc|cripto|crypto|nexo|usdt/, Bitcoin],
  [/d[oó]lar|usd|moneda extranjera|divisa|euro/, DollarSign],
  [/cedear|acci[oó]n|acciones|bolsa|on\b|obligacion/, TrendingUp],
  [/fci|fondo|plazo fijo|lecap|bono|ahorro/, PiggyBank],
  [/reintegro|devoluci|venta|ingreso/, Banknote],
  [/grupo|compartido|amigos/, Users],
]

export function iconoPara(nombre: string | undefined, tipo?: string, elegido?: string | null): LucideIcon {
  if (elegido && ICONOS[elegido]) return ICONOS[elegido].Icono
  const n = (nombre ?? '').toLowerCase()
  for (const [re, icono] of REGLAS) if (re.test(n)) return icono
  if (tipo === 'transferencia') return ArrowLeftRight
  if (tipo === 'ingreso') return Wallet
  if (tipo === 'aporte' || tipo === 'rescate' || tipo === 'inversion') return Coins
  return Receipt
}

export default function IconoCategoria({ nombre, tipo, icono }: { nombre?: string; tipo?: string; icono?: string | null }) {
  const Icono = iconoPara(nombre, tipo, icono)
  const clase = tipo === 'ingreso' || tipo === 'rescate' ? 'ingreso' : tipo === 'transferencia' ? 'neutro' : ''
  return (
    <span className={`icono-cat ${clase}`} aria-hidden="true">
      <Icono size={21} strokeWidth={1.9} />
    </span>
  )
}
