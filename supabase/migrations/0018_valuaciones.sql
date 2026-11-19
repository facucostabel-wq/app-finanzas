-- Valor actualizado de cada inversión, cargado a mano cuando quieras (además del cierre
-- de mes). "clave" es el id del activo, o "cat:<id>" para lo cargado sin subcategoría.
-- Se guarda el precio por unidad (si la inversión tiene cantidad) o el valor total.
-- Se puede ejecutar más de una vez.

create table if not exists public.valuaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  clave text not null check (char_length(clave) <= 60),
  precio numeric(24, 8) check (precio is null or precio >= 0),
  total numeric(18, 2) check (total is null or total >= 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  actualizado_at timestamptz not null default now(),
  check (num_nonnulls(precio, total) = 1),
  unique (usuario_id, clave)
);

alter table public.valuaciones enable row level security;
drop policy if exists "valuaciones: las mías" on public.valuaciones;
create policy "valuaciones: las mías" on public.valuaciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
