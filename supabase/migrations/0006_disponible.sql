-- Dinero disponible: saldo inicial + lo que sobra mes a mes.
-- Disponible = saldo inicial + ingresos − gastos − invertido + retirado
-- (cada moneda por separado; cuenta desde la fecha del saldo inicial).
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0005.

-- Fecha desde la que vale el saldo inicial (los movimientos anteriores no suman).
alter table public.perfiles
  add column if not exists saldo_inicial_fecha date not null default current_date;
grant update (saldo_inicial_fecha) on public.perfiles to authenticated;

create table if not exists public.saldos_iniciales (
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  monto numeric(14, 2) not null,
  primary key (usuario_id, moneda)
);

alter table public.saldos_iniciales enable row level security;

create policy "saldos: leer los propios" on public.saldos_iniciales
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "saldos: crear propios" on public.saldos_iniciales
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "saldos: editar los propios" on public.saldos_iniciales
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "saldos: borrar los propios" on public.saldos_iniciales
  for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Disponible por moneda hasta una fecha (exclusive). Corre con los permisos de
-- quien la llama, así que RLS limita todo a los datos propios.
create or replace function public.disponible_al(hasta date)
returns table (moneda text, monto numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with desde as (
    select saldo_inicial_fecha as fecha from public.perfiles where id = (select auth.uid())
  ),
  partes as (
    select s.moneda, s.monto from public.saldos_iniciales s
    union all
    select m.moneda,
           case when m.tipo in ('ingreso', 'rescate') then m.monto else -m.monto end
    from public.movimientos m, desde
    where m.fecha >= desde.fecha and m.fecha < hasta
  )
  select p.moneda, sum(p.monto) from partes p group by p.moneda;
$$;

revoke all on function public.disponible_al(date) from public, anon;
grant execute on function public.disponible_al(date) to authenticated;
