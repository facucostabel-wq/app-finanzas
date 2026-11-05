-- Etapa 2b: subcategorías de inversión (activos: BTC, AAPL…) y cantidades.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0003.

-- ============================================================
-- Subcategorías de inversión ("activos"): BTC dentro de Cripto, AAPL dentro de CEDEARs…
-- ============================================================
create table if not exists public.activos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  categoria_id uuid not null references public.categorias (id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 30),
  activa boolean not null default true,
  creado_at timestamptz not null default now(),
  unique (usuario_id, categoria_id, nombre)
);

alter table public.activos enable row level security;

create policy "activos: leer los propios" on public.activos
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "activos: crear propios" on public.activos
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "activos: editar los propios" on public.activos
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);

-- Un activo solo puede colgar de una categoría de inversión del mismo usuario.
create or replace function public.validar_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categorias
    where id = new.categoria_id and usuario_id = new.usuario_id and tipo = 'inversion'
  ) then
    raise exception 'La subcategoría debe pertenecer a una categoría de inversión propia' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_activo on public.activos;
create trigger validar_activo
  before insert or update on public.activos
  for each row execute function public.validar_activo();

-- ============================================================
-- Movimientos: subcategoría y cantidad (solo en inversiones)
-- ============================================================
alter table public.movimientos
  add column if not exists activo_id uuid references public.activos (id),
  -- Unidades compradas o vendidas (BTC, CEDEARs, cuotapartes, nominales). Hasta 10 decimales.
  add column if not exists cantidad numeric(28, 10) check (cantidad > 0);

alter table public.movimientos drop constraint if exists inversion_campos;
alter table public.movimientos add constraint inversion_campos
  check (tipo in ('aporte', 'rescate') or (activo_id is null and cantidad is null));

-- Validación ampliada: además de la categoría, la subcategoría tiene que ser
-- del mismo usuario y colgar de la categoría elegida.
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
  if new.activo_id is not null and not exists (
    select 1 from public.activos
    where id = new.activo_id and usuario_id = new.usuario_id and categoria_id = new.categoria_id
  ) then
    raise exception 'La subcategoría no corresponde a la categoría elegida' using errcode = '23514';
  end if;
  new.actualizado_at := now();
  return new;
end;
$$;
