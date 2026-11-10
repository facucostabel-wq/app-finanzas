-- Objetivos de ahorro y cierre de mes con cotizaciones.
--
-- Objetivos: monto meta (en dólares por defecto) y fecha opcional. La plata destinada
-- sale de tres fuentes que se pueden combinar:
--   * apartados a mano (objetivo_aportes: + separar, − usar/liberar),
--   * una cuenta entera (objetivo_vinculos.cuenta_id),
--   * una inversión (objetivo_vinculos.activo_id).
-- Una cuenta o inversión puede estar destinada a un solo objetivo.
--
-- Cierre de mes: cotizaciones de las monedas (en pesos por unidad), precio de cada
-- inversión y una foto del progreso de cada objetivo.
-- Se puede ejecutar más de una vez.

create table if not exists public.objetivos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  icono text check (icono is null or icono ~ '^[a-z0-9-]{1,40}$'),
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'USD' check (moneda ~ '^[A-Z]{3}$'),
  fecha date,
  estado text not null default 'activo' check (estado in ('activo', 'pausado', 'cumplido')),
  cumplido_at timestamptz,
  creado_at timestamptz not null default now()
);

create table if not exists public.objetivo_vinculos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  objetivo_id uuid not null references public.objetivos (id) on delete cascade,
  cuenta_id uuid references public.cuentas (id) on delete cascade,
  activo_id uuid references public.activos (id) on delete cascade,
  check (num_nonnulls(cuenta_id, activo_id) = 1)
);
create unique index if not exists objetivo_vinculos_cuenta on public.objetivo_vinculos (cuenta_id) where cuenta_id is not null;
create unique index if not exists objetivo_vinculos_activo on public.objetivo_vinculos (activo_id) where activo_id is not null;

create table if not exists public.objetivo_aportes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  objetivo_id uuid not null references public.objetivos (id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(14, 2) not null check (monto <> 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  cuenta_id uuid references public.cuentas (id) on delete set null,
  nota text check (nota is null or char_length(nota) <= 80),
  creado_at timestamptz not null default now()
);
create index if not exists objetivo_aportes_objetivo on public.objetivo_aportes (objetivo_id, fecha);

create table if not exists public.cierres (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  cerrado_at timestamptz not null default now(),
  unique (usuario_id, mes)
);

-- Pesos por unidad de cada moneda al cierre (USD = dólar MEP).
create table if not exists public.cierre_tipos (
  cierre_id uuid not null references public.cierres (id) on delete cascade,
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  ars numeric(20, 6) not null check (ars > 0),
  fuente text not null default 'manual' check (fuente in ('auto', 'manual')),
  primary key (cierre_id, moneda)
);

-- Precio por unidad de cada inversión al cierre. "clave" es el id del activo, o
-- "cat:<id>" para lo cargado sin subcategoría.
create table if not exists public.cierre_precios (
  cierre_id uuid not null references public.cierres (id) on delete cascade,
  clave text not null check (char_length(clave) <= 60),
  precio numeric(24, 8) not null check (precio >= 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  fuente text not null default 'manual' check (fuente in ('auto', 'manual')),
  primary key (cierre_id, clave)
);

-- Foto del progreso de cada objetivo (para estimar a qué ritmo se avanza).
create table if not exists public.cierre_objetivos (
  cierre_id uuid not null references public.cierres (id) on delete cascade,
  objetivo_id uuid not null references public.objetivos (id) on delete cascade,
  progreso numeric(14, 2) not null,
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  primary key (cierre_id, objetivo_id)
);

alter table public.objetivos enable row level security;
alter table public.objetivo_vinculos enable row level security;
alter table public.objetivo_aportes enable row level security;
alter table public.cierres enable row level security;
alter table public.cierre_tipos enable row level security;
alter table public.cierre_precios enable row level security;
alter table public.cierre_objetivos enable row level security;

-- Funciones auxiliares para las políticas (evitan repetir subconsultas).
create or replace function public.es_mio_objetivo(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.objetivos where id = o and usuario_id = (select auth.uid()));
$$;
create or replace function public.es_mia_cuenta(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select c is null or exists (select 1 from public.cuentas where id = c and usuario_id = (select auth.uid()));
$$;
create or replace function public.es_mio_activo(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select a is null or exists (select 1 from public.activos where id = a and usuario_id = (select auth.uid()));
$$;
create or replace function public.es_mio_cierre(c uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.cierres where id = c and usuario_id = (select auth.uid()));
$$;

drop policy if exists "objetivos: los míos" on public.objetivos;
create policy "objetivos: los míos" on public.objetivos for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

drop policy if exists "vínculos: los míos" on public.objetivo_vinculos;
create policy "vínculos: los míos" on public.objetivo_vinculos for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (
    usuario_id = (select auth.uid()) and public.es_mio_objetivo(objetivo_id)
    and public.es_mia_cuenta(cuenta_id) and public.es_mio_activo(activo_id)
  );

drop policy if exists "aportes: los míos" on public.objetivo_aportes;
create policy "aportes: los míos" on public.objetivo_aportes for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()) and public.es_mio_objetivo(objetivo_id) and public.es_mia_cuenta(cuenta_id));

drop policy if exists "cierres: los míos" on public.cierres;
create policy "cierres: los míos" on public.cierres for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

drop policy if exists "cierre_tipos: de mis cierres" on public.cierre_tipos;
create policy "cierre_tipos: de mis cierres" on public.cierre_tipos for all to authenticated
  using (public.es_mio_cierre(cierre_id)) with check (public.es_mio_cierre(cierre_id));

drop policy if exists "cierre_precios: de mis cierres" on public.cierre_precios;
create policy "cierre_precios: de mis cierres" on public.cierre_precios for all to authenticated
  using (public.es_mio_cierre(cierre_id)) with check (public.es_mio_cierre(cierre_id));

drop policy if exists "cierre_objetivos: de mis cierres" on public.cierre_objetivos;
create policy "cierre_objetivos: de mis cierres" on public.cierre_objetivos for all to authenticated
  using (public.es_mio_cierre(cierre_id))
  with check (public.es_mio_cierre(cierre_id) and public.es_mio_objetivo(objetivo_id));

revoke all on function public.es_mio_objetivo(uuid) from public, anon;
revoke all on function public.es_mia_cuenta(uuid) from public, anon;
revoke all on function public.es_mio_activo(uuid) from public, anon;
revoke all on function public.es_mio_cierre(uuid) from public, anon;
grant execute on function public.es_mio_objetivo(uuid) to authenticated;
grant execute on function public.es_mia_cuenta(uuid) to authenticated;
grant execute on function public.es_mio_activo(uuid) to authenticated;
grant execute on function public.es_mio_cierre(uuid) to authenticated;
