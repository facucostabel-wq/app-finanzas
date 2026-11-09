-- Etapa 3a: compras en cuotas con tarjeta de crédito.
-- Se carga la compra una vez (monto total + cantidad de cuotas) y la base genera
-- un gasto por mes: la cuota 1 en el mes de la compra y las siguientes, una por mes.
-- Editar o borrar la compra actualiza o borra todas sus cuotas.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0009.

create table if not exists public.compras_cuotas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  fecha date not null default current_date,
  monto_total numeric(14, 2) not null check (monto_total > 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  cuotas int not null check (cuotas between 2 and 60),
  cuenta_id uuid not null references public.cuentas (id),
  categoria_id uuid not null references public.categorias (id),
  nota text check (char_length(nota) <= 200),
  creado_at timestamptz not null default now()
);

alter table public.compras_cuotas enable row level security;

create policy "compras: leer las propias" on public.compras_cuotas
  for select to authenticated using ((select auth.uid()) = usuario_id);
create policy "compras: crear propias" on public.compras_cuotas
  for insert to authenticated with check ((select auth.uid()) = usuario_id);
create policy "compras: editar las propias" on public.compras_cuotas
  for update to authenticated
  using ((select auth.uid()) = usuario_id) with check ((select auth.uid()) = usuario_id);
create policy "compras: borrar las propias" on public.compras_cuotas
  for delete to authenticated using ((select auth.uid()) = usuario_id);

-- Cada cuota es un gasto común, vinculado a su compra.
alter table public.movimientos
  add column if not exists compra_id uuid references public.compras_cuotas (id) on delete cascade,
  add column if not exists cuota_n int check (cuota_n >= 1);

create index if not exists movimientos_compra on public.movimientos (compra_id);

-- La compra tiene que ser con una tarjeta propia y en una categoría de gasto propia.
create or replace function public.validar_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.cuentas
    where id = new.cuenta_id and usuario_id = new.usuario_id and tipo = 'tarjeta'
  ) then
    raise exception 'Las compras en cuotas tienen que ser con una tarjeta de crédito propia' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.categorias
    where id = new.categoria_id and usuario_id = new.usuario_id and tipo = 'gasto'
  ) then
    raise exception 'La categoría tiene que ser de gastos' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists validar_compra on public.compras_cuotas;
create trigger validar_compra
  before insert or update on public.compras_cuotas
  for each row execute function public.validar_compra();

-- Genera (o regenera) las cuotas. El redondeo va a la última cuota para que
-- la suma dé exactamente el total.
create or replace function public.generar_cuotas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  valor numeric(14, 2) := round(new.monto_total / new.cuotas, 2);
  i int;
begin
  delete from public.movimientos where compra_id = new.id;
  for i in 1..new.cuotas loop
    insert into public.movimientos (
      usuario_id, fecha, tipo, monto, moneda, categoria_id, cuenta_id, nota, compra_id, cuota_n
    ) values (
      new.usuario_id,
      (new.fecha + make_interval(months => i - 1))::date,
      'gasto',
      case when i = new.cuotas then new.monto_total - valor * (new.cuotas - 1) else valor end,
      new.moneda,
      new.categoria_id,
      new.cuenta_id,
      new.nota,
      new.id,
      i
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists generar_cuotas on public.compras_cuotas;
create trigger generar_cuotas
  after insert or update on public.compras_cuotas
  for each row execute function public.generar_cuotas();
