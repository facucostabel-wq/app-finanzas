-- Notificaciones de grupos: aviso dentro de la app + notificación push al celular.
--
-- Cómo funciona:
-- * Las funciones de grupos (gasto nuevo, editado o borrado, pago, alguien se une)
--   llaman a notificar(), que guarda un aviso por destinatario en `notificaciones`
--   (nunca para quien hizo la acción) y, si esa persona activó el push, le pide a la
--   Edge Function `enviar-push` que lo mande. El pedido sale con pg_net al confirmar.
-- * `push_config` guarda las claves VAPID. No tiene políticas: ningún usuario la puede
--   leer; solo las funciones security definer. La clave privada NO está en este archivo
--   (el repo es público): se carga aparte con un insert.

create extension if not exists pg_net with schema extensions;

create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  vapid_publica text not null,
  vapid_privada text not null,
  contacto text not null,
  funcion_url text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  creado_at timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;
drop policy if exists "push: ver las mías" on public.push_suscripciones;
create policy "push: ver las mías" on public.push_suscripciones
  for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "push: borrar las mías" on public.push_suscripciones;
create policy "push: borrar las mías" on public.push_suscripciones
  for delete to authenticated using (usuario_id = (select auth.uid()));
revoke insert, update on public.push_suscripciones from anon, authenticated;

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  grupo_id uuid references public.grupos (id) on delete cascade,
  titulo text not null,
  texto text not null,
  url text not null default '/grupos',
  leida boolean not null default false,
  creado_at timestamptz not null default now()
);
create index if not exists notificaciones_usuario on public.notificaciones (usuario_id, leida, creado_at desc);
alter table public.notificaciones enable row level security;
drop policy if exists "notificaciones: ver las mías" on public.notificaciones;
create policy "notificaciones: ver las mías" on public.notificaciones
  for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists "notificaciones: marcar las mías" on public.notificaciones;
create policy "notificaciones: marcar las mías" on public.notificaciones
  for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists "notificaciones: borrar las mías" on public.notificaciones;
create policy "notificaciones: borrar las mías" on public.notificaciones
  for delete to authenticated using (usuario_id = (select auth.uid()));
revoke insert, update on public.notificaciones from anon, authenticated;
grant update (leida) on public.notificaciones to authenticated;

-- Qué avisos apagó cada usuario: 'gasto_nuevo', 'gasto_cambio', 'pago', 'union'.
alter table public.perfiles add column if not exists avisos_off text[] not null default '{}';
grant update (avisos_off) on public.perfiles to authenticated;

-- Clave pública para suscribirse (es pública por diseño).
create or replace function public.clave_push()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select vapid_publica from public.push_config where id = 1;
$$;

-- Guarda la suscripción del dispositivo para el usuario actual. Si el mismo
-- dispositivo estaba suscripto con otra cuenta, pasa a esta.
create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, creado_at = now();
end;
$$;

-- Montos legibles: $ 12.500 / US$ 30,50 / EUR 10
create or replace function public.texto_monto(m numeric, mon text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case mon when 'ARS' then '$ ' when 'USD' then 'US$ ' else mon || ' ' end
    || regexp_replace(
         replace(replace(replace(to_char(m, 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.'),
         ',00$', '');
$$;

-- Nombre con el que figura en el grupo quien hace la acción.
create or replace function public.mi_nombre_en(g uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nombre from public.grupo_miembros where grupo_id = g and usuario_id = (select auth.uid())), 'Alguien');
$$;

-- Guarda el aviso y manda el push a cada dispositivo del destinatario.
-- Nunca avisa a quien hizo la acción.
drop function if exists public.notificar(uuid, uuid, text, text);
create or replace function public.notificar(p_usuario uuid, p_grupo uuid, p_titulo text, p_texto text, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.push_config;
  url text := '/grupos/' || p_grupo;
  mensajes jsonb;
begin
  if p_usuario is null or p_usuario = (select auth.uid()) then
    return;
  end if;
  -- Respeta los avisos que la persona apagó en Ajustes.
  if exists (select 1 from public.perfiles where id = p_usuario and p_tipo = any (avisos_off)) then
    return;
  end if;
  insert into public.notificaciones (usuario_id, grupo_id, titulo, texto, url)
  values (p_usuario, p_grupo, p_titulo, p_texto, url);

  select * into cfg from public.push_config where id = 1;
  if cfg is null then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
    into mensajes
    from public.push_suscripciones s where s.usuario_id = p_usuario;
  if mensajes is null then
    return;
  end if;
  -- Si el envío falla, no se cae la acción del grupo: el aviso dentro de la app ya quedó.
  begin
    perform net.http_post(
      url := cfg.funcion_url,
      body := jsonb_build_object(
        'vapid', jsonb_build_object('publica', cfg.vapid_publica, 'privada', cfg.vapid_privada, 'contacto', cfg.contacto),
        'suscripciones', mensajes,
        'aviso', jsonb_build_object('titulo', p_titulo, 'texto', p_texto, 'url', url)
      ),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then
    raise warning 'No se pudo pedir el push: %', sqlerrm;
  end;
end;
$$;
revoke all on function public.notificar(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.mi_nombre_en(uuid) from public, anon, authenticated;

-- Avisa a todos los que participan de un gasto (quien pagó y quienes tienen parte).
create or replace function public.avisar_gasto(p_gasto uuid, p_verbo text, p_extra uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  gg public.gastos_grupo;
  gnom text;
  quien text;
  r record;
  parte numeric;
begin
  select * into gg from public.gastos_grupo where id = p_gasto;
  if gg is null then return; end if;
  select nombre into gnom from public.grupos where id = gg.grupo_id;
  -- Si se está borrando el grupo entero, no hay a quién avisar.
  if gnom is null then return; end if;
  quien := public.mi_nombre_en(gg.grupo_id);
  for r in
    select distinct m.usuario_id, m.id as miembro
    from public.grupo_miembros m
    where m.grupo_id = gg.grupo_id and m.usuario_id is not null
      and (m.id = gg.pagado_por
           or m.id in (select miembro_id from public.divisiones where gasto_id = gg.id)
           or m.id = any (p_extra))
  loop
    select monto into parte from public.divisiones where gasto_id = gg.id and miembro_id = r.miembro;
    perform public.notificar(
      r.usuario_id, gg.grupo_id, gnom,
      quien || ' ' || p_verbo || ' «' || gg.descripcion || '» (' || public.texto_monto(gg.monto, gg.moneda) || ')'
        || case when p_verbo <> 'borró' and coalesce(parte, 0) > 0
             then '. Tu parte: ' || public.texto_monto(parte, gg.moneda) else '' end,
      case when p_verbo = 'cargó' then 'gasto_nuevo' else 'gasto_cambio' end
    );
  end loop;
end;
$$;
revoke all on function public.avisar_gasto(uuid, text, uuid[]) from public, anon, authenticated;

-- Gasto borrado: se avisa antes de que se borren las divisiones.
create or replace function public.al_borrar_gasto_grupo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.avisar_gasto(old.id, 'borró');
  return old;
end;
$$;
drop trigger if exists avisar_gasto_borrado on public.gastos_grupo;
create trigger avisar_gasto_borrado before delete on public.gastos_grupo
  for each row execute function public.al_borrar_gasto_grupo();

-- Las funciones de grupos, ahora con avisos. Lo demás queda igual que en 0011.
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
  gnom text;
  r record;
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  select id, nombre into g, gnom from public.grupos where invitacion_token = p_token;
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
  for r in select usuario_id from public.grupo_miembros where grupo_id = g and usuario_id is not null and usuario_id <> uid loop
    perform public.notificar(r.usuario_id, g, gnom, public.mi_nombre_en(g) || ' se unió al grupo', 'union');
  end loop;
  return g;
end;
$$;

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
  antes uuid[] := '{}';
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
    -- Quienes participaban antes también se enteran de la edición.
    select coalesce(array_agg(miembro_id), '{}') || array[(select pagado_por from public.gastos_grupo where id = gid)]
      into antes from public.divisiones where gasto_id = gid;
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

  perform public.avisar_gasto(gid, case when p_id is null then 'cargó' else 'editó' end, antes);
  return gid;
end;
$$;

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
  gnom text;
  quien text;
  de_nom text;
  a_nom text;
  de_uid uuid;
  a_uid uuid;
  plata text := public.texto_monto(p_monto, p_moneda);
begin
  if not public.es_miembro(p_grupo) then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  if (select count(*) from public.grupo_miembros where id in (p_de, p_a) and grupo_id = p_grupo) <> 2 then
    raise exception 'Los dos tienen que ser del grupo' using errcode = '23514';
  end if;
  insert into public.liquidaciones (grupo_id, de_miembro, a_miembro, monto, moneda, fecha, creado_por)
  values (p_grupo, p_de, p_a, p_monto, p_moneda, p_fecha, (select auth.uid()))
  returning id into lid;

  select nombre into gnom from public.grupos where id = p_grupo;
  quien := public.mi_nombre_en(p_grupo);
  select nombre, usuario_id into de_nom, de_uid from public.grupo_miembros where id = p_de;
  select nombre, usuario_id into a_nom, a_uid from public.grupo_miembros where id = p_a;
  -- A quien recibió la plata y a quien la pagó, cada uno con su versión.
  perform public.notificar(a_uid, p_grupo, gnom,
    case when de_uid = (select auth.uid()) then quien || ' registró que te pagó ' || plata
         else quien || ' registró que ' || de_nom || ' te pagó ' || plata end, 'pago');
  perform public.notificar(de_uid, p_grupo, gnom,
    case when a_uid = (select auth.uid()) then quien || ' registró que le pagaste ' || plata
         else quien || ' registró que le pagaste ' || plata || ' a ' || a_nom end, 'pago');
  return lid;
end;
$$;

revoke all on function public.clave_push() from public, anon;
revoke all on function public.guardar_suscripcion(text, text, text) from public, anon;
grant execute on function public.clave_push() to authenticated;
grant execute on function public.guardar_suscripcion(text, text, text) to authenticated;

-- Configuración (se corre aparte, con las claves reales; no se sube al repo):
-- insert into public.push_config (vapid_publica, vapid_privada, contacto, funcion_url)
-- values ('<publica>', '<privada>', 'mailto:<tu email>', 'https://<proyecto>.supabase.co/functions/v1/enviar-push')
-- on conflict (id) do update set vapid_publica = excluded.vapid_publica, vapid_privada = excluded.vapid_privada,
--   contacto = excluded.contacto, funcion_url = excluded.funcion_url;
