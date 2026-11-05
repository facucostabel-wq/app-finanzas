-- Etapa 2c: compra de moneda extranjera como inversión.
-- Categoría "Moneda extranjera" con una subcategoría por moneda (USD, EUR…).
-- En los resúmenes cuenta la cantidad de esa moneda (sin conversión); el monto
-- pagado en otra moneda da la cotización de compra.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0004.

-- 1) Marcas: la categoría agrupa monedas; cada subcategoría es una moneda.
alter table public.categorias
  add column if not exists es_divisas boolean not null default false;
alter table public.categorias drop constraint if exists divisas_solo_inversion;
alter table public.categorias add constraint divisas_solo_inversion
  check (not es_divisas or tipo = 'inversion');

alter table public.activos
  add column if not exists divisa text check (divisa ~ '^[A-Z]{3}$');

-- Los usuarios no pueden marcar categorías como "de monedas": solo nombre, orden y activa.
revoke insert, update on public.categorias from authenticated, anon;
grant insert (tipo, nombre, orden, activa) on public.categorias to authenticated;
grant update (nombre, orden, activa) on public.categorias to authenticated;

-- 2) Subcategorías: en "Moneda extranjera" tienen que ser una moneda (y se llaman por su código).
create or replace function public.validar_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat record;
begin
  select usuario_id, tipo, es_divisas into cat from public.categorias where id = new.categoria_id;
  if cat is null or cat.usuario_id <> new.usuario_id or cat.tipo <> 'inversion' then
    raise exception 'La subcategoría debe pertenecer a una categoría de inversión propia' using errcode = '23514';
  end if;
  if cat.es_divisas then
    if new.divisa is null then
      raise exception 'En moneda extranjera la subcategoría tiene que ser una moneda' using errcode = '23514';
    end if;
    new.nombre := new.divisa;
  else
    new.divisa := null;
  end if;
  return new;
end;
$$;

-- 3) Categorías base: se suma "Moneda extranjera" con USD y EUR.
create or replace function public.crear_categorias_base(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid;
begin
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

  -- Si ya tiene su categoría de monedas (aunque la haya renombrado), no se crea otra.
  select id into me from public.categorias where usuario_id = uid and es_divisas;
  if me is null then
    insert into public.categorias (usuario_id, tipo, nombre, orden, es_divisas)
    values (uid, 'inversion', 'Moneda extranjera', 0, true)
    on conflict (usuario_id, tipo, nombre) do update set es_divisas = true
    returning id into me;
  end if;

  insert into public.activos (usuario_id, categoria_id, nombre, divisa)
  select uid, me, d, d
  from unnest(array['USD', 'EUR']) as d
  on conflict (usuario_id, categoria_id, nombre) do nothing;
end;
$$;

revoke all on function public.crear_categorias_base(uuid) from public, anon, authenticated;

-- 4) Validación de movimientos: en moneda extranjera hay que indicar la moneda
--    (subcategoría) y la cantidad; y no se paga una moneda con la misma moneda.
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat record;
  act record;
begin
  select usuario_id, tipo, es_divisas into cat from public.categorias where id = new.categoria_id;
  if cat is null or cat.usuario_id <> new.usuario_id then
    raise exception 'Categoría inválida' using errcode = '23514';
  end if;
  if (new.tipo = 'gasto' and cat.tipo <> 'gasto')
     or (new.tipo = 'ingreso' and cat.tipo <> 'ingreso')
     or (new.tipo in ('aporte', 'rescate') and cat.tipo <> 'inversion') then
    raise exception 'La categoría no corresponde al tipo de movimiento' using errcode = '23514';
  end if;
  if new.activo_id is not null then
    select usuario_id, categoria_id, divisa into act from public.activos where id = new.activo_id;
    if act is null or act.usuario_id <> new.usuario_id or act.categoria_id <> new.categoria_id then
      raise exception 'La subcategoría no corresponde a la categoría elegida' using errcode = '23514';
    end if;
  end if;
  if cat.es_divisas then
    if new.activo_id is null then
      raise exception 'Elegí qué moneda compraste o vendiste' using errcode = '23514';
    end if;
    if new.cantidad is null then
      raise exception 'Indicá la cantidad de moneda que compraste o vendiste' using errcode = '23514';
    end if;
    if new.moneda = act.divisa then
      raise exception 'Pagar una moneda con la misma moneda no es una inversión' using errcode = '23514';
    end if;
  end if;
  new.actualizado_at := now();
  return new;
end;
$$;

-- 5) Usuarios existentes: se les agrega "Moneda extranjera" con USD y EUR.
select public.crear_categorias_base(id) from public.perfiles;
