-- Dinero disponible "de caja": los gastos con tarjeta de crédito no lo descuentan
-- al comprar; lo descuenta el pago del resumen (nuevo tipo "pago_tarjeta").
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0006.

-- 1) Nuevo tipo de movimiento: pago de tarjeta (neutro: no es gasto, sí es salida de plata).
alter table public.movimientos drop constraint if exists movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check
  check (tipo in ('gasto', 'ingreso', 'aporte', 'rescate', 'pago_tarjeta'));

-- El pago de tarjeta no lleva categoría (los consumos ya se registraron como gastos).
alter table public.movimientos alter column categoria_id drop not null;
alter table public.movimientos drop constraint if exists categoria_segun_tipo;
alter table public.movimientos add constraint categoria_segun_tipo
  check ((tipo = 'pago_tarjeta') = (categoria_id is null));

-- 2) Validación: el pago de tarjeta no tiene categoría que validar.
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
  if new.tipo = 'pago_tarjeta' then
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

-- 3) Disponible = saldo inicial + ingresos − gastos sin tarjeta de crédito
--    − pagos de tarjeta − invertido + retirado.
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
    from public.movimientos m, desde
    where m.fecha >= desde.fecha and m.fecha < hasta
  )
  select p.moneda, sum(p.monto) from partes p group by p.moneda;
$$;
