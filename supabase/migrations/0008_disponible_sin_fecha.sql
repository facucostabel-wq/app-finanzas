-- Corrección: la fecha del saldo inicial pasa a ser opcional.
-- Antes tomaba por defecto el día en que se ejecutó 0006, y los movimientos
-- anteriores a ese día no sumaban al disponible. Ahora, sin fecha, cuentan todos.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0007.

alter table public.perfiles alter column saldo_inicial_fecha drop default;
alter table public.perfiles alter column saldo_inicial_fecha drop not null;

-- Quien no cargó saldo inicial queda sin fecha (cuentan todos sus movimientos).
update public.perfiles p
   set saldo_inicial_fecha = null
 where not exists (select 1 from public.saldos_iniciales s where s.usuario_id = p.id);

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
           case
             when m.tipo in ('ingreso', 'rescate') then m.monto
             when m.tipo = 'gasto' and m.forma_pago = 'credito' then 0
             else -m.monto
           end
    from public.movimientos m
    where m.fecha < hasta
      and ((select fecha from desde) is null or m.fecha >= (select fecha from desde))
  )
  select p.moneda, sum(p.monto) from partes p group by p.moneda;
$$;
