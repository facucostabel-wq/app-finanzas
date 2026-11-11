-- Administración de grupos.
--
-- * Cada grupo tiene un administrador (al principio, quien lo creó).
-- * Solo el admin puede: eliminar miembros, unir un invitado con la cuenta de quien
--   entró después (hereda todo lo del invitado) y borrar el grupo.
-- * Cualquiera puede salir. Si sale el admin, pasa a serlo el miembro con cuenta más
--   antiguo. Si no queda nadie con cuenta, el grupo se borra.
-- * Quien sale o es eliminado y ya tiene gastos o pagos queda como "ex miembro": pierde
--   el acceso, pero su historial y su saldo siguen para que las cuentas cierren. Si no
--   tenía nada cargado, se borra.
-- Se puede ejecutar más de una vez.

alter table public.grupos add column if not exists admin_id uuid references public.perfiles (id) on delete set null;
alter table public.grupo_miembros add column if not exists unido_at timestamptz;
alter table public.grupo_miembros add column if not exists removido_at timestamptz;

-- Datos existentes: se unió cuando se creó la fila; admin = creador (o el más antiguo).
update public.grupo_miembros set unido_at = creado_at where unido_at is null and usuario_id is not null;
update public.grupos g set admin_id = coalesce(
  (select m.usuario_id from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id = g.creado_por and m.removido_at is null),
  (select m.usuario_id from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id is not null and m.removido_at is null
     order by m.unido_at nulls last, m.creado_at limit 1))
where g.admin_id is null;

-- Miembro activo = con cuenta y no removido.
create or replace function public.es_miembro(g uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.grupo_miembros
    where grupo_id = g and usuario_id = (select auth.uid()) and removido_at is null
  );
$$;

create or replace function public.es_miembro_de_gasto(gasto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.gastos_grupo gg
    join public.grupo_miembros m on m.grupo_id = gg.grupo_id
    where gg.id = gasto and m.usuario_id = (select auth.uid()) and m.removido_at is null
  );
$$;

create or replace function public.es_admin(g uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.grupos where id = g and admin_id = (select auth.uid()))
    and public.es_miembro(g);
$$;

-- ¿Tiene gastos, divisiones o pagos? (si tiene, no se borra: queda como ex miembro)
create or replace function public.miembro_con_historial(m uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.gastos_grupo where pagado_por = m)
      or exists (select 1 from public.divisiones where miembro_id = m)
      or exists (select 1 from public.liquidaciones where de_miembro = m or a_miembro = m);
$$;

-- Saca a un miembro (o lo deja como ex miembro) y reasigna el admin si hace falta.
create or replace function public.quitar_miembro(p_miembro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mm public.grupo_miembros;
  nuevo_admin uuid;
begin
  select * into mm from public.grupo_miembros where id = p_miembro;
  if mm is null then return; end if;
  if public.miembro_con_historial(p_miembro) then
    update public.grupo_miembros set removido_at = now() where id = p_miembro;
  else
    delete from public.grupo_miembros where id = p_miembro;
  end if;

  if mm.usuario_id is not null and exists (select 1 from public.grupos where id = mm.grupo_id and admin_id = mm.usuario_id) then
    select usuario_id into nuevo_admin from public.grupo_miembros
     where grupo_id = mm.grupo_id and usuario_id is not null and removido_at is null and usuario_id <> mm.usuario_id
     order by unido_at nulls last, creado_at limit 1;
    update public.grupos set admin_id = nuevo_admin where id = mm.grupo_id;
  end if;

  -- Sin nadie con cuenta, el grupo no le sirve a nadie (se borra sin avisar gasto por gasto).
  if not exists (select 1 from public.grupo_miembros where grupo_id = mm.grupo_id and usuario_id is not null and removido_at is null) then
    delete from public.liquidaciones where grupo_id = mm.grupo_id;
    delete from public.gastos_grupo where grupo_id = mm.grupo_id;
    delete from public.grupos where id = mm.grupo_id;
  end if;
end;
$$;
revoke all on function public.quitar_miembro(uuid) from public, anon, authenticated;

create or replace function public.eliminar_miembro(p_miembro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g uuid;
  u uuid;
begin
  select grupo_id, usuario_id into g, u from public.grupo_miembros where id = p_miembro and removido_at is null;
  if g is null then raise exception 'Ese miembro no existe' using errcode = '22023'; end if;
  if not public.es_admin(g) then raise exception 'Solo el administrador puede eliminar miembros' using errcode = '42501'; end if;
  if u = (select auth.uid()) then raise exception 'Para irte, usá "Salir del grupo"' using errcode = '22023'; end if;
  perform public.quitar_miembro(p_miembro);
end;
$$;

create or replace function public.salir_grupo(p_grupo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m uuid;
begin
  select id into m from public.grupo_miembros
   where grupo_id = p_grupo and usuario_id = (select auth.uid()) and removido_at is null;
  if m is null then raise exception 'No sos miembro del grupo' using errcode = '42501'; end if;
  perform public.quitar_miembro(m);
end;
$$;

-- El invitado "Pedro" y el miembro con cuenta "Pedro" son la misma persona: todo lo del
-- invitado pasa al miembro con cuenta y el invitado desaparece.
create or replace function public.unir_invitado(p_invitado uuid, p_miembro uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  g uuid;
begin
  select grupo_id into g from public.grupo_miembros where id = p_invitado and usuario_id is null and removido_at is null;
  if g is null then raise exception 'Ese invitado no existe' using errcode = '22023'; end if;
  if not public.es_admin(g) then raise exception 'Solo el administrador puede unir miembros' using errcode = '42501'; end if;
  if not exists (select 1 from public.grupo_miembros where id = p_miembro and grupo_id = g and usuario_id is not null and removido_at is null) then
    raise exception 'Elegí un miembro con cuenta del mismo grupo' using errcode = '22023';
  end if;

  -- Pagos entre los dos dejan de tener sentido (serían pagos a sí mismo).
  delete from public.liquidaciones
   where (de_miembro = p_invitado and a_miembro = p_miembro) or (de_miembro = p_miembro and a_miembro = p_invitado);
  update public.gastos_grupo set pagado_por = p_miembro where pagado_por = p_invitado;
  -- Si los dos tenían parte en el mismo gasto, se suman.
  update public.divisiones d set monto = d.monto + i.monto
    from public.divisiones i
   where i.miembro_id = p_invitado and d.miembro_id = p_miembro and d.gasto_id = i.gasto_id;
  delete from public.divisiones i
   where i.miembro_id = p_invitado and exists (select 1 from public.divisiones d where d.gasto_id = i.gasto_id and d.miembro_id = p_miembro);
  update public.divisiones set miembro_id = p_miembro where miembro_id = p_invitado;
  update public.liquidaciones set de_miembro = p_miembro where de_miembro = p_invitado;
  update public.liquidaciones set a_miembro = p_miembro where a_miembro = p_invitado;
  delete from public.grupo_miembros where id = p_invitado;
end;
$$;

create or replace function public.borrar_grupo(p_grupo uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin(p_grupo) then raise exception 'Solo el administrador puede borrar el grupo' using errcode = '42501'; end if;
  -- En orden, porque divisiones y pagos apuntan a los miembros. Los movimientos
  -- personales que cada uno registró quedan en sus finanzas. Sin un aviso por gasto.
  perform set_config('app.sin_avisos', '1', true);
  delete from public.liquidaciones where grupo_id = p_grupo;
  delete from public.gastos_grupo where grupo_id = p_grupo;
  delete from public.grupos where id = p_grupo;
end;
$$;

-- Avisos de gastos: no a ex miembros, y nada cuando se borra un grupo entero.
create or replace function public.avisar_gasto(p_gasto uuid, p_verbo text, p_extra uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  gg public.gastos_grupo;
  gnom text;
  quien text;
  r record;
  parte numeric;
begin
  if current_setting('app.sin_avisos', true) = '1' then return; end if;
  select * into gg from public.gastos_grupo where id = p_gasto;
  if gg is null then return; end if;
  select nombre into gnom from public.grupos where id = gg.grupo_id;
  if gnom is null then return; end if;
  quien := public.mi_nombre_en(gg.grupo_id);
  for r in
    select distinct m.usuario_id, m.id as miembro
    from public.grupo_miembros m
    where m.grupo_id = gg.grupo_id and m.usuario_id is not null and m.removido_at is null
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

-- crear_grupo y unirse_grupo: ahora registran admin y fecha de ingreso.
create or replace function public.crear_grupo(p_nombre text, p_moneda text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  g uuid;
  nom text;
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  insert into public.grupos (nombre, moneda, creado_por, admin_id) values (btrim(p_nombre), p_moneda, uid, uid) returning id into g;
  select coalesce(nullif(nombre, ''), 'Yo') into nom from public.perfiles where id = uid;
  insert into public.grupo_miembros (grupo_id, usuario_id, nombre, unido_at) values (g, uid, nom, now());
  perform public.asegurar_cuenta_grupo(g, uid);
  return g;
end;
$$;

create or replace function public.ver_invitacion(p_token uuid)
returns table (grupo_id uuid, nombre text, invitados jsonb, ya_soy_miembro boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.nombre,
         coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', m.nombre) order by m.nombre)
                   from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id is null and m.removido_at is null), '[]'::jsonb),
         exists (select 1 from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id = (select auth.uid()) and m.removido_at is null)
  from public.grupos g
  where g.invitacion_token = p_token and (select auth.uid()) is not null;
$$;

create or replace function public.unirse_grupo(p_token uuid, p_invitado uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
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
  if exists (select 1 from public.grupo_miembros where grupo_id = g and usuario_id = uid and removido_at is null) then
    return g;
  end if;
  if exists (select 1 from public.grupo_miembros where grupo_id = g and usuario_id = uid and removido_at is not null) then
    -- Un ex miembro que vuelve con el link recupera su lugar y su historial.
    update public.grupo_miembros set removido_at = null, unido_at = now() where grupo_id = g and usuario_id = uid;
  elsif p_invitado is not null then
    update public.grupo_miembros set usuario_id = uid, unido_at = now()
     where id = p_invitado and grupo_id = g and usuario_id is null and removido_at is null;
    if not found then raise exception 'Ese invitado ya no está disponible' using errcode = '22023'; end if;
  else
    select coalesce(nullif(nombre, ''), 'Nuevo miembro') into nom from public.perfiles where id = uid;
    insert into public.grupo_miembros (grupo_id, usuario_id, nombre, unido_at) values (g, uid, nom, now());
  end if;
  -- Un grupo que se había quedado sin admin lo recupera con quien entra.
  update public.grupos set admin_id = uid where id = g and admin_id is null;
  perform public.asegurar_cuenta_grupo(g, uid);
  for r in select usuario_id from public.grupo_miembros where grupo_id = g and usuario_id is not null and usuario_id <> uid and removido_at is null loop
    perform public.notificar(r.usuario_id, g, gnom, public.mi_nombre_en(g) || ' se unió al grupo', 'union');
  end loop;
  return g;
end;
$$;

-- Borrar la cuenta: los grupos donde era admin pasan al miembro más antiguo.
create or replace function public.borrar_mi_cuenta()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  m record;
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  for m in select id from public.grupo_miembros where usuario_id = uid loop
    perform public.quitar_miembro(m.id);
  end loop;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.es_admin(uuid) from public, anon;
revoke all on function public.miembro_con_historial(uuid) from public, anon, authenticated;
revoke all on function public.eliminar_miembro(uuid) from public, anon;
revoke all on function public.salir_grupo(uuid) from public, anon;
revoke all on function public.unir_invitado(uuid, uuid) from public, anon;
revoke all on function public.borrar_grupo(uuid) from public, anon;
grant execute on function public.es_admin(uuid) to authenticated;
grant execute on function public.eliminar_miembro(uuid) to authenticated;
grant execute on function public.salir_grupo(uuid) to authenticated;
grant execute on function public.unir_invitado(uuid, uuid) to authenticated;
grant execute on function public.borrar_grupo(uuid) to authenticated;
grant execute on function public.borrar_mi_cuenta() to authenticated;
