-- Presupuestos por categoría, etiquetas y eventos, y deudas 1 a 1.
-- Se puede ejecutar más de una vez.

-- ============================================================
-- 1) Presupuestos
-- ============================================================
-- Por categoría de gasto, o general (categoria_id null). Monto fijo o % de lo que ingresó en
-- el mes. Valen para todos los meses y cada mes arranca de cero.
create table if not exists public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  categoria_id uuid references public.categorias (id) on delete cascade,
  tipo text not null check (tipo in ('monto', 'porcentaje')),
  monto numeric(16, 2) check (monto is null or monto > 0),
  porcentaje numeric(5, 2) check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  moneda text not null default 'ARS' check (moneda ~ '^[A-Z]{3}$'),
  creado_at timestamptz not null default now(),
  check ((tipo = 'monto' and monto is not null) or (tipo = 'porcentaje' and porcentaje is not null))
);
-- Uno por categoría, y uno solo general.
create unique index if not exists presupuestos_categoria on public.presupuestos (usuario_id, categoria_id) where categoria_id is not null;
create unique index if not exists presupuestos_general on public.presupuestos (usuario_id) where categoria_id is null;

alter table public.presupuestos enable row level security;
drop policy if exists "presupuestos: los míos" on public.presupuestos;
create policy "presupuestos: los míos" on public.presupuestos for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and (categoria_id is null or exists (
      select 1 from public.categorias c
       where c.id = categoria_id and c.usuario_id = (select auth.uid()) and c.tipo = 'gasto'
    ))
  );
