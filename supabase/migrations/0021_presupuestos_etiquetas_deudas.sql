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

-- ============================================================
-- 2) Etiquetas y eventos
-- ============================================================
-- Una etiqueta (#bariloche) agrupa movimientos de distintas categorías. Si tiene fechas
-- (desde/hasta) es un "evento": mientras dura, la app la propone sola al cargar.
create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  desde date,
  hasta date,
  creado_at timestamptz not null default now(),
  check (hasta is null or desde is null or hasta >= desde)
);
create unique index if not exists etiquetas_nombre on public.etiquetas (usuario_id, lower(btrim(nombre)));

-- Qué movimientos (o compras en cuotas, con todas sus cuotas) llevan cada etiqueta.
create table if not exists public.etiquetado (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas (id) on delete cascade,
  movimiento_id uuid references public.movimientos (id) on delete cascade,
  compra_id uuid references public.compras_cuotas (id) on delete cascade,
  check (num_nonnulls(movimiento_id, compra_id) = 1)
);
create unique index if not exists etiquetado_mov on public.etiquetado (etiqueta_id, movimiento_id) where movimiento_id is not null;
create unique index if not exists etiquetado_compra on public.etiquetado (etiqueta_id, compra_id) where compra_id is not null;
create index if not exists etiquetado_usuario on public.etiquetado (usuario_id);

alter table public.etiquetas enable row level security;
alter table public.etiquetado enable row level security;
drop policy if exists "etiquetas: las mías" on public.etiquetas;
create policy "etiquetas: las mías" on public.etiquetas for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "etiquetado: el mío" on public.etiquetado;
create policy "etiquetado: el mío" on public.etiquetado for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid())
    and exists (select 1 from public.etiquetas e where e.id = etiqueta_id and e.usuario_id = (select auth.uid()))
    and (movimiento_id is null or exists (select 1 from public.movimientos m where m.id = movimiento_id and m.usuario_id = (select auth.uid())))
    and (compra_id is null or exists (select 1 from public.compras_cuotas c where c.id = compra_id and c.usuario_id = (select auth.uid())))
  );
