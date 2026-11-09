-- Etapa 4: grupos y gastos compartidos.
-- Lo del grupo (miembros, gastos, divisiones, pagos entre miembros) lo ven todos sus
-- miembros. Lo personal (tus movimientos) sigue siendo solo tuyo: cada uno registra
-- su parte en su propia cuenta "de grupo", que no suma al disponible.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0010.

-- ============================================================
-- 1) Tablas compartidas
-- ============================================================
create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  moneda text not null default 'ARS' check (moneda ~ '^[A-Z]{3}$'),
  creado_por uuid not null default auth.uid() references public.perfiles (id),
  invitacion_token uuid not null default gen_random_uuid() unique,
  creado_at timestamptz not null default now()
);

create table if not exists public.grupo_miembros (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  -- null = invitado sin cuenta (solo nombre)
  usuario_id uuid references public.perfiles (id) on delete set null,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 40),
  creado_at timestamptz not null default now(),
  unique (grupo_id, usuario_id)
);

create table if not exists public.gastos_grupo (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  descripcion text not null check (char_length(btrim(descripcion)) between 1 and 80),
  fecha date not null default current_date,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  pagado_por uuid not null references public.grupo_miembros (id),
  modo text not null default 'iguales' check (modo in ('iguales', 'montos', 'porcentajes')),
  creado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_at timestamptz not null default now()
);

create table if not exists public.divisiones (
  gasto_id uuid not null references public.gastos_grupo (id) on delete cascade,
  miembro_id uuid not null references public.grupo_miembros (id),
  monto numeric(14, 2) not null check (monto >= 0),
  primary key (gasto_id, miembro_id)
);

create table if not exists public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos (id) on delete cascade,
  de_miembro uuid not null references public.grupo_miembros (id),
  a_miembro uuid not null references public.grupo_miembros (id),
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  fecha date not null default current_date,
  creado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_at timestamptz not null default now(),
  check (de_miembro <> a_miembro)
);

create index if not exists gastos_grupo_grupo on public.gastos_grupo (grupo_id, fecha desc);
create index if not exists liquidaciones_grupo on public.liquidaciones (grupo_id);
create index if not exists grupo_miembros_usuario on public.grupo_miembros (usuario_id);

-- ============================================================
-- 2) Lo personal: cuenta "de grupo" y vínculo de cada movimiento
-- ============================================================
alter table public.cuentas drop constraint if exists cuentas_tipo_check;
alter table public.cuentas add constraint cuentas_tipo_check
  check (tipo in ('banco', 'billetera', 'efectivo', 'tarjeta', 'broker', 'grupo'));
alter table public.cuentas add column if not exists grupo_id uuid references public.grupos (id) on delete set null;
create unique index if not exists cuentas_grupo_unica on public.cuentas (usuario_id, grupo_id) where grupo_id is not null;

alter table public.movimientos
  add column if not exists gasto_grupo_id uuid references public.gastos_grupo (id) on delete set null,
  add column if not exists liquidacion_id uuid references public.liquidaciones (id) on delete set null;

-- ============================================================
-- 3) Seguridad: solo los miembros ven y cargan cosas del grupo
-- ============================================================
create or replace function public.es_miembro(g uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.grupo_miembros where grupo_id = g and usuario_id = (select auth.uid())
  );
$$;

create or replace function public.es_miembro_de_gasto(gasto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gastos_grupo gg
    join public.grupo_miembros m on m.grupo_id = gg.grupo_id
    where gg.id = gasto and m.usuario_id = (select auth.uid())
  );
$$;

alter table public.grupos enable row level security;
alter table public.grupo_miembros enable row level security;
alter table public.gastos_grupo enable row level security;
alter table public.divisiones enable row level security;
alter table public.liquidaciones enable row level security;

create policy "grupos: ver si soy miembro" on public.grupos
  for select to authenticated using (public.es_miembro(id));
create policy "grupos: renombrar si soy miembro" on public.grupos
  for update to authenticated using (public.es_miembro(id)) with check (public.es_miembro(id));

create policy "miembros: ver los de mis grupos" on public.grupo_miembros
  for select to authenticated using (public.es_miembro(grupo_id));

create policy "gastos: ver los de mis grupos" on public.gastos_grupo
  for select to authenticated using (public.es_miembro(grupo_id));
create policy "gastos: borrar los que cargué" on public.gastos_grupo
  for delete to authenticated using (creado_por = (select auth.uid()) and public.es_miembro(grupo_id));

create policy "divisiones: ver las de mis grupos" on public.divisiones
  for select to authenticated using (public.es_miembro_de_gasto(gasto_id));

create policy "pagos: ver los de mis grupos" on public.liquidaciones
  for select to authenticated using (public.es_miembro(grupo_id));
create policy "pagos: borrar los que cargué" on public.liquidaciones
  for delete to authenticated using (creado_por = (select auth.uid()) and public.es_miembro(grupo_id));

-- Las altas y ediciones pasan por las funciones de abajo, que validan todo.
revoke insert, update on public.grupos, public.grupo_miembros, public.gastos_grupo,
  public.divisiones, public.liquidaciones from authenticated, anon;
grant update (nombre) on public.grupos to authenticated;

-- ============================================================
-- 4) Funciones (cada una valida que quien la llama sea miembro)
-- ============================================================

-- Cuenta personal "de grupo" (se crea al entrar a un grupo).
create or replace function public.asegurar_cuenta_grupo(g uuid, uid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
  nom text;
begin
  select id into cid from public.cuentas where usuario_id = uid and grupo_id = g;
  if cid is not null then
    return cid;
  end if;
  select nombre into nom from public.grupos where id = g;
  insert into public.cuentas (usuario_id, nombre, tipo, orden, grupo_id)
  values (uid, left('Grupo ' || nom || ' ' || left(g::text, 4), 40), 'grupo', 900, g)
  returning id into cid;
  return cid;
end;
$$;
revoke all on function public.asegurar_cuenta_grupo(uuid, uuid) from public, anon, authenticated;

create or replace function public.crear_grupo(p_nombre text, p_moneda text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  g uuid;
  nom text;
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  insert into public.grupos (nombre, moneda, creado_por) values (btrim(p_nombre), p_moneda, uid) returning id into g;
  select coalesce(nullif(nombre, ''), 'Yo') into nom from public.perfiles where id = uid;
  insert into public.grupo_miembros (grupo_id, usuario_id, nombre) values (g, uid, nom);
  perform public.asegurar_cuenta_grupo(g, uid);
  return g;
end;
$$;

-- Invitado sin cuenta (solo nombre).
create or replace function public.agregar_invitado(p_grupo uuid, p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m uuid;
begin
  if not public.es_miembro(p_grupo) then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  insert into public.grupo_miembros (grupo_id, nombre) values (p_grupo, btrim(p_nombre)) returning id into m;
  return m;
end;
$$;

-- Vista previa de una invitación (para quien todavía no es miembro).
create or replace function public.ver_invitacion(p_token uuid)
returns table (grupo_id uuid, nombre text, invitados jsonb, ya_soy_miembro boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.nombre,
         coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.nombre)
                   from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id is null), '[]'::jsonb),
         exists (select 1 from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id = (select auth.uid()))
  from public.grupos g
  where g.invitacion_token = p_token and (select auth.uid()) is not null;
$$;

-- Entrar a un grupo con el link. Opcional: "soy este invitado" para heredar su historial.
create or replace function public.unirse_grupo(p_token uuid, p_invitado uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  g uuid;
  nom text;
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  select id into g from public.grupos where invitacion_token = p_token;
  if g is null then raise exception 'La invitación no es válida' using errcode = '22023'; end if;
  if exists (select 1 from public.grupo_miembros where grupo_id = g and usuario_id = uid) then
    return g;
  end if;
  if p_invitado is not null then
    update public.grupo_miembros set usuario_id = uid
     where id = p_invitado and grupo_id = g and usuario_id is null;
    if not found then raise exception 'Ese invitado ya no está disponible' using errcode = '22023'; end if;
  else
    select coalesce(nullif(nombre, ''), 'Nuevo miembro') into nom from public.perfiles where id = uid;
    insert into public.grupo_miembros (grupo_id, usuario_id, nombre) values (g, uid, nom);
  end if;
  perform public.asegurar_cuenta_grupo(g, uid);
  return g;
end;
$$;

-- Nuevo link de invitación (invalida el anterior).
create or replace function public.renovar_invitacion(p_grupo uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t uuid := gen_random_uuid();
begin
  if not public.es_miembro(p_grupo) then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  update public.grupos set invitacion_token = t where id = p_grupo;
  return t;
end;
$$;

-- Alta o edición de un gasto del grupo con su división.
-- p_divisiones: [{"miembro_id": "...", "monto": 123.45}, ...] y tiene que sumar el total.
create or replace function public.guardar_gasto_grupo(
  p_id uuid, p_grupo uuid, p_descripcion text, p_fecha date, p_monto numeric,
  p_moneda text, p_pagado_por uuid, p_modo text, p_divisiones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  gid uuid := p_id;
  suma numeric;
begin
  if not public.es_miembro(p_grupo) then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  if not exists (select 1 from public.grupo_miembros where id = p_pagado_por and grupo_id = p_grupo) then
    raise exception 'Quien pagó tiene que ser del grupo' using errcode = '23514';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_divisiones) d
    where not exists (select 1 from public.grupo_miembros m where m.id = (d->>'miembro_id')::uuid and m.grupo_id = p_grupo)
  ) then
    raise exception 'La división incluye a alguien que no es del grupo' using errcode = '23514';
  end if;
  select coalesce(sum((d->>'monto')::numeric), 0) into suma from jsonb_array_elements(p_divisiones) d;
  if abs(suma - p_monto) > 0.01 then
    raise exception 'La división (%) no suma el total (%)', suma, p_monto using errcode = '23514';
  end if;

  if gid is null then
    insert into public.gastos_grupo (grupo_id, descripcion, fecha, monto, moneda, pagado_por, modo, creado_por)
    values (p_grupo, btrim(p_descripcion), p_fecha, p_monto, p_moneda, p_pagado_por, p_modo, uid)
    returning id into gid;
  else
    update public.gastos_grupo
       set descripcion = btrim(p_descripcion), fecha = p_fecha, monto = p_monto, moneda = p_moneda,
           pagado_por = p_pagado_por, modo = p_modo
     where id = gid and grupo_id = p_grupo and creado_por = uid;
    if not found then raise exception 'Solo quien cargó el gasto puede editarlo' using errcode = '42501'; end if;
    delete from public.divisiones where gasto_id = gid;
  end if;

  insert into public.divisiones (gasto_id, miembro_id, monto)
  select gid, (d->>'miembro_id')::uuid, (d->>'monto')::numeric
  from jsonb_array_elements(p_divisiones) d
  where (d->>'monto')::numeric > 0;
  return gid;
end;
$$;

-- Pago entre miembros ("saldar").
create or replace function public.registrar_pago_grupo(
  p_grupo uuid, p_de uuid, p_a uuid, p_monto numeric, p_moneda text, p_fecha date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid uuid;
begin
  if not public.es_miembro(p_grupo) then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  if (select count(*) from public.grupo_miembros where id in (p_de, p_a) and grupo_id = p_grupo) <> 2 then
    raise exception 'Los dos tienen que ser del grupo' using errcode = '23514';
  end if;
  insert into public.liquidaciones (grupo_id, de_miembro, a_miembro, monto, moneda, fecha, creado_por)
  values (p_grupo, p_de, p_a, p_monto, p_moneda, p_fecha, (select auth.uid()))
  returning id into lid;
  return lid;
end;
$$;

revoke all on function public.crear_grupo(text, text) from public, anon;
revoke all on function public.agregar_invitado(uuid, text) from public, anon;
revoke all on function public.ver_invitacion(uuid) from public, anon;
revoke all on function public.unirse_grupo(uuid, uuid) from public, anon;
revoke all on function public.renovar_invitacion(uuid) from public, anon;
revoke all on function public.guardar_gasto_grupo(uuid, uuid, text, date, numeric, text, uuid, text, jsonb) from public, anon;
revoke all on function public.registrar_pago_grupo(uuid, uuid, uuid, numeric, text, date) from public, anon;
grant execute on function public.crear_grupo(text, text) to authenticated;
grant execute on function public.agregar_invitado(uuid, text) to authenticated;
grant execute on function public.ver_invitacion(uuid) to authenticated;
grant execute on function public.unirse_grupo(uuid, uuid) to authenticated;
grant execute on function public.renovar_invitacion(uuid) to authenticated;
grant execute on function public.guardar_gasto_grupo(uuid, uuid, text, date, numeric, text, uuid, text, jsonb) to authenticated;
grant execute on function public.registrar_pago_grupo(uuid, uuid, uuid, numeric, text, date) to authenticated;
