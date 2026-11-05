-- Etapa 2: categorías y movimientos personales, con Row Level Security.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0001.

-- ============================================================
-- Monedas favoritas de cada usuario (la primera es la predeterminada)
-- ============================================================
alter table public.perfiles
  add column if not exists monedas_favoritas text[] not null default array['ARS', 'USD', 'EUR']
  check (
    cardinality(monedas_favoritas) between 1 and 10
    and array_to_string(monedas_favoritas, ',') ~ '^[A-Z]{3}(,[A-Z]{3})*$'
  );

grant update (monedas_favoritas) on public.perfiles to authenticated;

-- ============================================================
-- Categorías: cada usuario tiene las suyas (set base + propias)
-- ============================================================
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  tipo text not null check (tipo in ('gasto', 'ingreso', 'inversion')),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  orden int not null default 100,
  activa boolean not null default true,
  creado_at timestamptz not null default now(),
  unique (usuario_id, tipo, nombre)
);

alter table public.categorias enable row level security;

create policy "categorias: leer las propias" on public.categorias
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "categorias: crear propias" on public.categorias
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "categorias: editar las propias" on public.categorias
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
-- Sin política de delete: las categorías se desactivan (activa = false) para no perder historial.

-- ============================================================
-- Movimientos personales
-- ============================================================
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  fecha date not null default current_date,
  -- gasto | ingreso | aporte (sale plata hacia una inversión) | rescate (vuelve de una inversión)
  tipo text not null check (tipo in ('gasto', 'ingreso', 'aporte', 'rescate')),
  monto numeric(14, 2) not null check (monto > 0),
  -- Código ISO 4217 de 3 letras (ARS, USD, EUR, BRL…).
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  categoria_id uuid not null references public.categorias (id),
  forma_pago text check (forma_pago in ('efectivo', 'debito', 'credito', 'transferencia', 'billetera')),
  nota text check (char_length(nota) <= 200),
  creado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  -- La forma de pago se pide solo en los gastos.
  constraint forma_pago_solo_gastos check ((tipo = 'gasto') = (forma_pago is not null))
);

create index if not exists movimientos_usuario_fecha on public.movimientos (usuario_id, fecha desc);

alter table public.movimientos enable row level security;

create policy "movimientos: leer los propios" on public.movimientos
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "movimientos: crear propios" on public.movimientos
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "movimientos: editar los propios" on public.movimientos
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "movimientos: borrar los propios" on public.movimientos
  for delete to authenticated using ((select auth.uid()) = usuario_id);

-- La categoría tiene que ser del mismo usuario y del tipo correcto
-- (un gasto no puede usar una categoría de ingresos ni una de otra persona).
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat record;
begin
  select usuario_id, tipo into cat from public.categorias where id = new.categoria_id;
  if cat is null or cat.usuario_id <> new.usuario_id then
    raise exception 'Categoría inválida' using errcode = '23514';
  end if;
  if (new.tipo = 'gasto' and cat.tipo <> 'gasto')
     or (new.tipo = 'ingreso' and cat.tipo <> 'ingreso')
     or (new.tipo in ('aporte', 'rescate') and cat.tipo <> 'inversion') then
    raise exception 'La categoría no corresponde al tipo de movimiento' using errcode = '23514';
  end if;
  new.actualizado_at := now();
  return new;
end;
$$;

drop trigger if exists validar_movimiento on public.movimientos;
create trigger validar_movimiento
  before insert or update on public.movimientos
  for each row execute function public.validar_movimiento();

-- ============================================================
-- Categorías base: se crean para cada usuario nuevo y para los existentes
-- ============================================================
create or replace function public.crear_categorias_base(uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.categorias (usuario_id, tipo, nombre, orden)
  select uid, c.tipo, c.nombre, c.orden
  from (values
    ('gasto', 'Supermercado', 1), ('gasto', 'Salidas y comidas', 2), ('gasto', 'Auto', 3),
    ('gasto', 'Vivienda', 4), ('gasto', 'Servicios', 5), ('gasto', 'Deporte', 6),
    ('gasto', 'Transporte', 7), ('gasto', 'Compras', 8), ('gasto', 'Suscripciones', 9),
    ('gasto', 'Viajes', 10), ('gasto', 'Regalos', 11), ('gasto', 'Préstamos', 12),
    ('gasto', 'Cargos de tarjeta', 13), ('gasto', 'Otros', 14),
    ('ingreso', 'Sueldo', 1), ('ingreso', 'Extras', 2), ('ingreso', 'Rendimientos', 3),
    ('ingreso', 'Reintegros', 4),
    ('inversion', 'CEDEARs', 1), ('inversion', 'Acciones', 2), ('inversion', 'FCI', 3),
    ('inversion', 'Cripto', 4), ('inversion', 'Plazo fijo', 5), ('inversion', 'Otras', 6)
  ) as c (tipo, nombre, orden)
  on conflict (usuario_id, tipo, nombre) do nothing;
$$;

revoke all on function public.crear_categorias_base(uuid) from public, anon, authenticated;

-- Al crearse un perfil nuevo, se cargan sus categorías base.
create or replace function public.al_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.crear_categorias_base(new.id);
  return new;
end;
$$;

drop trigger if exists categorias_base on public.perfiles;
create trigger categorias_base
  after insert on public.perfiles
  for each row execute function public.al_crear_perfil();

-- Usuarios que ya existen (tu cuenta actual).
select public.crear_categorias_base(id) from public.perfiles;
