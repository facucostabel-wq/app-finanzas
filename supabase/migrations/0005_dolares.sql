-- Etapa 2c: compra de dólares como inversión.
-- La categoría "Dólares" se marca como divisa USD: en los resúmenes cuenta la
-- cantidad de dólares (sin conversión), y el monto en pesos da la cotización de compra.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0004.

-- 1) Marca de divisa en categorías (solo para inversiones).
alter table public.categorias
  add column if not exists divisa text check (divisa ~ '^[A-Z]{3}$');

alter table public.categorias drop constraint if exists divisa_solo_inversion;
alter table public.categorias add constraint divisa_solo_inversion
  check (divisa is null or tipo = 'inversion');

-- Los usuarios no pueden marcar ni desmarcar divisas: solo nombre, orden y activa.
revoke insert, update on public.categorias from authenticated, anon;
grant insert (tipo, nombre, orden, activa) on public.categorias to authenticated;
grant update (nombre, orden, activa) on public.categorias to authenticated;

-- 2) Categorías base: se suma "Dólares" (divisa USD) con subcategorías por tipo de dólar.
create or replace function public.crear_categorias_base(uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dolares uuid;
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

  -- Si ya tiene su categoría de dólares (aunque la haya renombrado), no se crea otra.
  select id into dolares from public.categorias where usuario_id = uid and divisa = 'USD';
  if dolares is null then
    insert into public.categorias (usuario_id, tipo, nombre, orden, divisa)
    values (uid, 'inversion', 'Dólares', 0, 'USD')
    on conflict (usuario_id, tipo, nombre) do update set divisa = 'USD'
    returning id into dolares;
  end if;

  insert into public.activos (usuario_id, categoria_id, nombre)
  select uid, dolares, a.nombre
  from (values ('MEP'), ('Blue'), ('Oficial'), ('USDT')) as a (nombre)
  on conflict (usuario_id, categoria_id, nombre) do nothing;
end;
$$;

revoke all on function public.crear_categorias_base(uuid) from public, anon, authenticated;

-- 3) Validación: en una categoría divisa la cantidad (dólares) es obligatoria,
--    y no se puede "comprar dólares con dólares" (eso es un movimiento entre cuentas).
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat record;
begin
  select usuario_id, tipo, divisa into cat from public.categorias where id = new.categoria_id;
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
  if cat.divisa is not null then
    if new.cantidad is null then
      raise exception 'Indicá cuántos dólares compraste o vendiste' using errcode = '23514';
    end if;
    if new.moneda = cat.divisa then
      raise exception 'Pagar dólares con dólares no es una inversión' using errcode = '23514';
    end if;
  end if;
  new.actualizado_at := now();
  return new;
end;
$$;

-- 4) Usuarios existentes: se les agrega "Dólares" y sus subcategorías.
select public.crear_categorias_base(id) from public.perfiles;
