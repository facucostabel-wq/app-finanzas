-- Cuentas: bancos, billeteras, efectivo, tarjetas de crédito y brokers.
-- Reemplazan a la "forma de pago". Cada cuenta puede tener saldo en varias monedas.
-- Las transferencias internas mueven plata entre cuentas sin ser gasto ni ingreso
-- (pagar la tarjeta = transferir del banco a la tarjeta).
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0008.

-- ============================================================
-- 1) Cuentas
-- ============================================================
create table if not exists public.cuentas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  -- banco | billetera | efectivo | tarjeta (de crédito) | broker (IOL, Nexo…)
  tipo text not null check (tipo in ('banco', 'billetera', 'efectivo', 'tarjeta', 'broker')),
  orden int not null default 100,
  activa boolean not null default true,
  creado_at timestamptz not null default now(),
  unique (usuario_id, nombre)
);

-- Una tarjeta puede colgar de una cuenta (ej. "Visa Galicia" dentro de "Galicia").
alter table public.cuentas add column if not exists cuenta_padre_id uuid references public.cuentas (id);
alter table public.cuentas drop constraint if exists padre_solo_tarjetas;
alter table public.cuentas add constraint padre_solo_tarjetas
  check (cuenta_padre_id is null or (tipo = 'tarjeta' and cuenta_padre_id <> id));

create or replace function public.validar_cuenta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cuenta_padre_id is not null and not exists (
    select 1 from public.cuentas
    where id = new.cuenta_padre_id and usuario_id = new.usuario_id and tipo <> 'tarjeta'
  ) then
    raise exception 'La tarjeta tiene que pertenecer a una cuenta propia' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_cuenta on public.cuentas;
create trigger validar_cuenta
  before insert or update on public.cuentas
  for each row execute function public.validar_cuenta();

alter table public.cuentas enable row level security;

create policy "cuentas: leer las propias" on public.cuentas
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "cuentas: crear propias" on public.cuentas
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "cuentas: editar las propias" on public.cuentas
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
-- Sin delete: las cuentas se ocultan (activa = false) para no perder historial.

-- ============================================================
-- 2) Movimientos: cuenta, cuenta destino (transferencias)
-- ============================================================
alter table public.movimientos
  add column if not exists cuenta_id uuid references public.cuentas (id),
  add column if not exists cuenta_destino_id uuid references public.cuentas (id);

-- Nuevo tipo "transferencia"; "pago_tarjeta" se convierte en transferencia más abajo.
alter table public.movimientos drop constraint if exists movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check
  check (tipo in ('gasto', 'ingreso', 'aporte', 'rescate', 'pago_tarjeta', 'transferencia'));

-- La forma de pago queda solo como dato histórico (la reemplaza la cuenta).
alter table public.movimientos drop constraint if exists forma_pago_solo_gastos;
alter table public.movimientos drop constraint if exists categoria_segun_tipo;

-- ============================================================
-- 3) Validación: cuentas propias; transferencias sin categoría
--    (va antes de migrar los datos, porque las actualizaciones pasan por esta validación)
-- ============================================================
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
  new.actualizado_at := now();
  if not exists (select 1 from public.cuentas where id = new.cuenta_id and usuario_id = new.usuario_id) then
    raise exception 'Cuenta inválida' using errcode = '23514';
  end if;
  if new.tipo = 'transferencia' then
    if not exists (select 1 from public.cuentas where id = new.cuenta_destino_id and usuario_id = new.usuario_id) then
      raise exception 'Cuenta de destino inválida' using errcode = '23514';
    end if;
    return new;
  end if;
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
  return new;
end;
$$;

-- ============================================================
-- 4) Datos existentes: cuenta "Principal" y, si hace falta, "Tarjeta de crédito"
-- ============================================================
-- Principal para quien ya tiene movimientos o saldos.
insert into public.cuentas (usuario_id, nombre, tipo, orden)
select p.id, 'Principal', 'banco', 1
from public.perfiles p
where exists (select 1 from public.movimientos m where m.usuario_id = p.id)
   or exists (select 1 from public.saldos_iniciales s where s.usuario_id = p.id)
on conflict (usuario_id, nombre) do nothing;

-- Tarjeta para quien cargó gastos con crédito o pagos de tarjeta.
insert into public.cuentas (usuario_id, nombre, tipo, orden)
select distinct m.usuario_id, 'Tarjeta de crédito', 'tarjeta', 2
from public.movimientos m
where m.forma_pago = 'credito' or m.tipo = 'pago_tarjeta'
on conflict (usuario_id, nombre) do nothing;

-- Gastos con crédito → la tarjeta.
update public.movimientos m
   set cuenta_id = c.id
  from public.cuentas c
 where m.cuenta_id is null and m.forma_pago = 'credito'
   and c.usuario_id = m.usuario_id and c.nombre = 'Tarjeta de crédito';

-- Pagos de tarjeta → transferencia de Principal a la tarjeta.
update public.movimientos m
   set tipo = 'transferencia',
       cuenta_id = (select id from public.cuentas where usuario_id = m.usuario_id and nombre = 'Principal'),
       cuenta_destino_id = (select id from public.cuentas where usuario_id = m.usuario_id and nombre = 'Tarjeta de crédito')
 where m.tipo = 'pago_tarjeta';

-- Todo lo demás → Principal.
update public.movimientos m
   set cuenta_id = c.id
  from public.cuentas c
 where m.cuenta_id is null and c.usuario_id = m.usuario_id and c.nombre = 'Principal';

-- Desde ahora: siempre con cuenta; transferencias con destino distinto y sin categoría.
alter table public.movimientos alter column cuenta_id set not null;
alter table public.movimientos drop constraint if exists movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check
  check (tipo in ('gasto', 'ingreso', 'aporte', 'rescate', 'transferencia'));
alter table public.movimientos add constraint categoria_segun_tipo
  check ((tipo = 'transferencia') = (categoria_id is null));
alter table public.movimientos drop constraint if exists transferencia_destino;
alter table public.movimientos add constraint transferencia_destino
  check (
    (tipo = 'transferencia') = (cuenta_destino_id is not null)
    and (cuenta_destino_id is null or cuenta_destino_id <> cuenta_id)
  );

create index if not exists movimientos_cuenta on public.movimientos (cuenta_id);

-- ============================================================
-- 5) Saldos iniciales por cuenta y moneda
-- ============================================================
alter table public.saldos_iniciales add column if not exists cuenta_id uuid references public.cuentas (id);
update public.saldos_iniciales s
   set cuenta_id = c.id
  from public.cuentas c
 where s.cuenta_id is null and c.usuario_id = s.usuario_id and c.nombre = 'Principal';
alter table public.saldos_iniciales alter column cuenta_id set not null;
alter table public.saldos_iniciales drop constraint if exists saldos_iniciales_pkey;
alter table public.saldos_iniciales add primary key (cuenta_id, moneda);

-- El saldo inicial solo se puede cargar en cuentas propias.
drop policy if exists "saldos: crear propios" on public.saldos_iniciales;
drop policy if exists "saldos: editar los propios" on public.saldos_iniciales;
create policy "saldos: crear propios" on public.saldos_iniciales
  for insert to authenticated
  with check (
    (select auth.uid()) = usuario_id
    and exists (select 1 from public.cuentas c where c.id = cuenta_id and c.usuario_id = (select auth.uid()))
  );
create policy "saldos: editar los propios" on public.saldos_iniciales
  for update to authenticated
  using ((select auth.uid()) = usuario_id)
  with check (
    (select auth.uid()) = usuario_id
    and exists (select 1 from public.cuentas c where c.id = cuenta_id and c.usuario_id = (select auth.uid()))
  );

-- ============================================================
-- 6) Saldo de cada cuenta y moneda hasta una fecha (exclusive)
--    saldo inicial + ingresos + retirado + transferencias recibidas
--    − gastos − invertido − transferencias enviadas
-- ============================================================
create or replace function public.saldos_al(hasta date)
returns table (cuenta_id uuid, moneda text, monto numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with desde as (
    select saldo_inicial_fecha as fecha from public.perfiles where id = (select auth.uid())
  ),
  movs as (
    select * from public.movimientos m
    where m.fecha < hasta
      and ((select fecha from desde) is null or m.fecha >= (select fecha from desde))
  ),
  partes as (
    select s.cuenta_id, s.moneda, s.monto from public.saldos_iniciales s
    union all
    select m.cuenta_id, m.moneda,
           case when m.tipo in ('ingreso', 'rescate') then m.monto else -m.monto end
    from movs m
    union all
    select m.cuenta_destino_id, m.moneda, m.monto
    from movs m where m.tipo = 'transferencia'
  )
  select p.cuenta_id, p.moneda, sum(p.monto) from partes p group by p.cuenta_id, p.moneda;
$$;

revoke all on function public.saldos_al(date) from public, anon;
grant execute on function public.saldos_al(date) to authenticated;

-- El cálculo anterior queda reemplazado por saldos_al.
drop function if exists public.disponible_al(date);

-- ============================================================
-- 7) Usuarios nuevos: arrancan con una cuenta "Efectivo"
-- ============================================================
create or replace function public.al_crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.crear_categorias_base(new.id);
  insert into public.cuentas (usuario_id, nombre, tipo, orden)
  values (new.id, 'Efectivo', 'efectivo', 1)
  on conflict (usuario_id, nombre) do nothing;
  return new;
end;
$$;
