-- Demo: cualquiera puede probar la app sin crear cuenta.
--
-- * Al tocar "Probar la demo" la app entra con un usuario anónimo de Supabase (sin email
--   ni contraseña) y llama a crear_demo(), que le carga datos inventados.
-- * La demo dura 24 horas. Después se borra sola con todo lo que tenga (borrar_demos_viejas,
--   que corre cada hora con pg_cron). Si sale antes con "Crear mi cuenta", se borra en el
--   momento (borrar_mi_cuenta).
-- * Desde la demo no se puede entrar a grupos reales ni invitar gente a los de la demo,
--   ni activar notificaciones.
--
-- Antes de ejecutar: Supabase → Authentication → Sign In / Providers →
-- "Allow anonymous sign-ins" activado.
-- Se puede ejecutar más de una vez.

-- ============================================================
-- 1) ¿Quien llama es un usuario de la demo?
-- ============================================================
create or replace function public.es_demo(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_anonymous from auth.users where id = uid), false);
$$;
revoke all on function public.es_demo(uuid) from public, anon;
grant execute on function public.es_demo(uuid) to authenticated;

-- ============================================================
-- 2) Datos inventados
-- ============================================================
-- Inserta un movimiento solo si la fecha ya pasó (los del mes en curso se cortan en hoy).
create or replace function public.demo_mov(
  uid uuid, f date, t text, monto numeric, mon text, cat uuid, cta uuid,
  nota text default null, act uuid default null, cant numeric default null, destino uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  id uuid;
begin
  if f > current_date then return null; end if;
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, categoria_id, cuenta_id, nota, activo_id, cantidad, cuenta_destino_id)
  values (uid, f, t, round(monto, -2 * (mon = 'ARS')::int), mon, cat, cta, nota, act, cant, destino)
  returning movimientos.id into id;
  return id;
end;
$$;
revoke all on function public.demo_mov(uuid, date, text, numeric, text, uuid, uuid, text, uuid, numeric, uuid) from public, anon, authenticated;

create or replace function public.crear_demo()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  c_ef uuid; c_banco uuid; c_visa uuid; c_mp uuid; c_broker uuid; c_grupo uuid;
  k int;
  m date;
  inf numeric;
  hoy date := current_date;
  -- categorías
  g_super uuid; g_salidas uuid; g_auto uuid; g_vivienda uuid; g_servicios uuid; g_deporte uuid;
  g_suscr uuid; g_compras uuid; g_viajes uuid; i_sueldo uuid; i_extras uuid;
  v_cedear uuid; v_fci uuid; v_cripto uuid; v_mon uuid;
  -- subcategorías
  a_aapl uuid; a_spy uuid; a_mm uuid; a_btc uuid; a_usd uuid;
  o_viaje uuid; o_fondo uuid;
  ci uuid;
  gr uuid; yo uuid; juli uuid; tomi uuid; caro uuid;
  gasto uuid;
  f date;
begin
  if uid is null or not public.es_demo(uid) then
    raise exception 'Solo para la demo' using errcode = '42501';
  end if;
  -- Una sola vez por usuario de demo.
  if exists (select 1 from public.movimientos where usuario_id = uid) then return; end if;

  update public.perfiles set nombre = 'Demo', consentimiento_at = now() where id = uid;

  -- Cuentas (Efectivo ya viene con el usuario).
  select id into c_ef from public.cuentas where usuario_id = uid and nombre = 'Efectivo';
  insert into public.cuentas (usuario_id, nombre, tipo, orden) values (uid, 'Banco Galicia', 'banco', 2) returning id into c_banco;
  insert into public.cuentas (usuario_id, nombre, tipo, orden, cuenta_padre_id) values (uid, 'Visa Galicia', 'tarjeta', 3, c_banco) returning id into c_visa;
  insert into public.cuentas (usuario_id, nombre, tipo, orden) values (uid, 'Mercado Pago', 'billetera', 4) returning id into c_mp;
  insert into public.cuentas (usuario_id, nombre, tipo, orden) values (uid, 'Broker', 'broker', 5) returning id into c_broker;

  select id into g_super from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Supermercado';
  select id into g_salidas from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Salidas y comidas';
  select id into g_auto from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Auto';
  select id into g_vivienda from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Vivienda';
  select id into g_servicios from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Servicios';
  select id into g_deporte from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Deporte';
  select id into g_suscr from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Suscripciones';
  select id into g_compras from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Compras';
  select id into g_viajes from public.categorias where usuario_id = uid and tipo = 'gasto' and nombre = 'Viajes';
  select id into i_sueldo from public.categorias where usuario_id = uid and tipo = 'ingreso' and nombre = 'Sueldo';
  select id into i_extras from public.categorias where usuario_id = uid and tipo = 'ingreso' and nombre = 'Extras';
  select id into v_cedear from public.categorias where usuario_id = uid and tipo = 'inversion' and nombre = 'CEDEARs';
  select id into v_fci from public.categorias where usuario_id = uid and tipo = 'inversion' and nombre = 'FCI';
  select id into v_cripto from public.categorias where usuario_id = uid and tipo = 'inversion' and nombre = 'Cripto';
  select id into v_mon from public.categorias where usuario_id = uid and es_divisas;
  select id into a_usd from public.activos where usuario_id = uid and categoria_id = v_mon and divisa = 'USD';

  insert into public.activos (usuario_id, categoria_id, nombre) values (uid, v_cedear, 'AAPL') returning id into a_aapl;
  insert into public.activos (usuario_id, categoria_id, nombre) values (uid, v_cedear, 'SPY') returning id into a_spy;
  insert into public.activos (usuario_id, categoria_id, nombre) values (uid, v_fci, 'Money market') returning id into a_mm;
  insert into public.activos (usuario_id, categoria_id, nombre) values (uid, v_cripto, 'BTC') returning id into a_btc;

  -- Tres meses: los dos anteriores completos y el actual hasta hoy.
  for k in reverse 2..0 loop
    m := (date_trunc('month', hoy) - make_interval(months => k))::date;
    inf := 1 + 0.025 * (2 - k); -- los precios suben un poco cada mes

    perform public.demo_mov(uid, m, 'ingreso', 1850000 * inf, 'ARS', i_sueldo, c_banco, 'Sueldo');
    perform public.demo_mov(uid, m + 1, 'transferencia', 150000, 'ARS', null, c_banco, 'A Mercado Pago', destino => c_mp);
    perform public.demo_mov(uid, m + 1, 'transferencia', 60000, 'ARS', null, c_banco, 'Retiro cajero', destino => c_ef);
    perform public.demo_mov(uid, m + 2, 'gasto', 48000 * inf, 'ARS', g_deporte, c_mp, 'Gimnasio');
    perform public.demo_mov(uid, m + 4, 'gasto', 520000 * inf, 'ARS', g_vivienda, c_banco, 'Alquiler + expensas');
    perform public.demo_mov(uid, m + 6, 'gasto', 72000 * inf, 'ARS', g_servicios, c_banco, 'Luz, gas e internet');
    perform public.demo_mov(uid, m + 7, 'gasto', 19500 * inf, 'ARS', g_suscr, c_visa, 'Netflix + Spotify');
    perform public.demo_mov(uid, m + 9, 'gasto', 85000 * inf, 'ARS', g_auto, c_visa, 'Seguro del auto');

    perform public.demo_mov(uid, m + 3, 'gasto', 64300 * inf, 'ARS', g_super, c_visa, 'Coto');
    perform public.demo_mov(uid, m + 10, 'gasto', 38900 * inf, 'ARS', g_super, c_mp, 'Chino de la esquina');
    perform public.demo_mov(uid, m + 17, 'gasto', 71200 * inf, 'ARS', g_super, c_visa, 'Carrefour');
    perform public.demo_mov(uid, m + 24, 'gasto', 29800 * inf, 'ARS', g_super, c_mp, 'Verdulería');

    perform public.demo_mov(uid, m + 5, 'gasto', 42000 * inf, 'ARS', g_salidas, c_visa, 'Cena con amigos');
    perform public.demo_mov(uid, m + 8, 'gasto', 18500 * inf, 'ARS', g_salidas, c_ef, 'Birras');
    perform public.demo_mov(uid, m + 13, 'gasto', 56000 * inf, 'ARS', g_salidas, c_visa, 'Parrilla');
    perform public.demo_mov(uid, m + 19, 'gasto', 24000 * inf, 'ARS', g_salidas, c_mp, 'Café y brunch');
    perform public.demo_mov(uid, m + 22, 'gasto', 35000 * inf, 'ARS', g_salidas, c_ef, 'Boliche');

    perform public.demo_mov(uid, m + 11, 'gasto', 62000 * inf, 'ARS', g_auto, c_visa, 'Nafta');
    perform public.demo_mov(uid, m + 25, 'gasto', 58000 * inf, 'ARS', g_auto, c_visa, 'Nafta');

    perform public.demo_mov(uid, m + 11, 'transferencia', 480000 * inf, 'ARS', null, c_banco, 'Pago resumen Visa', destino => c_visa);
  end loop;

  -- Algunos sueltos.
  m := (date_trunc('month', hoy) - interval '1 month')::date;
  perform public.demo_mov(uid, m + 14, 'gasto', 89000, 'ARS', g_compras, c_visa, 'Zapatillas');
  perform public.demo_mov(uid, m + 20, 'ingreso', 150000, 'ARS', i_extras, c_mp, 'Venta de la bici vieja');

  -- Inversiones (lo pagado sale del banco; la tenencia se ve en Inversiones).
  m := (date_trunc('month', hoy) - interval '2 months')::date;
  perform public.demo_mov(uid, m + 2, 'aporte', 435000, 'ARS', v_mon, c_banco, 'Dólar MEP', a_usd, 300);
  perform public.demo_mov(uid, m + 3, 'aporte', 180000, 'ARS', v_cedear, c_banco, null, a_aapl, 12);
  perform public.demo_mov(uid, m + 3, 'aporte', 220000, 'ARS', v_cedear, c_banco, null, a_spy, 7);
  perform public.demo_mov(uid, m + 4, 'aporte', 300000, 'ARS', v_fci, c_banco, 'Para tener a mano', a_mm);
  m := (date_trunc('month', hoy) - interval '1 month')::date;
  perform public.demo_mov(uid, m + 3, 'aporte', 290000, 'ARS', v_mon, c_banco, 'Dólar MEP', a_usd, 200);
  perform public.demo_mov(uid, m + 5, 'aporte', 145, 'USD', v_cripto, c_banco, null, a_btc, 0.0012);
  perform public.demo_mov(uid, m + 12, 'aporte', 200000, 'ARS', v_fci, c_banco, null, a_mm);
  perform public.demo_mov(uid, m + 18, 'rescate', 90000, 'ARS', v_fci, c_banco, 'Rescate parcial', a_mm);

  -- La compra de BTC fue en dólares: se le dan dólares al banco para que el saldo cierre.
  perform public.demo_mov(uid, m + 5, 'ingreso', 150, 'USD', i_extras, c_banco, 'Trabajo freelance');

  -- Cierre del mes pasado: dólar y precios de cada inversión.
  insert into public.cierres (usuario_id, mes) values (uid, m) returning id into ci;
  insert into public.cierre_tipos (cierre_id, moneda, ars, fuente) values (ci, 'USD', 1465, 'manual');
  insert into public.cierre_precios (cierre_id, clave, precio, moneda) values
    (ci, a_aapl::text, 16200, 'ARS'),
    (ci, a_spy::text, 33500, 'ARS'),
    (ci, a_btc::text, 104500, 'USD');
  -- El FCI se actualizó por valor total hace unos días.
  insert into public.valuaciones (usuario_id, clave, total, moneda, actualizado_at)
  values (uid, a_mm::text, 431500, 'ARS', now() - interval '3 days');

  -- Objetivos.
  insert into public.objetivos (usuario_id, nombre, icono, monto, moneda, fecha)
  values (uid, 'Viaje a Europa', 'plane', 3000, 'USD', (date_trunc('month', hoy) + interval '8 months')::date)
  returning id into o_viaje;
  insert into public.objetivo_vinculos (usuario_id, objetivo_id, activo_id) values (uid, o_viaje, a_usd);
  insert into public.objetivos (usuario_id, nombre, icono, monto, moneda)
  values (uid, 'Fondo de emergencia', 'piggy', 2000000, 'ARS')
  returning id into o_fondo;
  insert into public.objetivo_aportes (usuario_id, objetivo_id, fecha, monto, moneda, cuenta_id, nota) values
    (uid, o_fondo, m + 2, 300000, 'ARS', c_banco, 'Apartado del sueldo'),
    (uid, o_fondo, (date_trunc('month', hoy))::date, 200000, 'ARS', c_banco, 'Apartado del sueldo');
  insert into public.cierre_objetivos (cierre_id, objetivo_id, progreso, moneda) values
    (ci, o_viaje, 500, 'USD'), (ci, o_fondo, 300000, 'ARS');

  -- Grupo con amigos inventados.
  perform set_config('app.sin_avisos', '1', true);
  gr := public.crear_grupo('Finde en Bariloche', 'ARS');
  select id into yo from public.grupo_miembros where grupo_id = gr and usuario_id = uid;
  select id into c_grupo from public.cuentas where usuario_id = uid and grupo_id = gr;
  juli := public.agregar_invitado(gr, 'Juli');
  tomi := public.agregar_invitado(gr, 'Tomi');
  caro := public.agregar_invitado(gr, 'Caro');
  f := greatest(hoy - 12, date_trunc('month', hoy)::date - 10);

  gasto := public.guardar_gasto_grupo(null, gr, 'Cabaña', f, 480000, 'ARS', yo, 'iguales',
    jsonb_build_array(jsonb_build_object('miembro_id', yo, 'monto', 120000), jsonb_build_object('miembro_id', juli, 'monto', 120000),
                      jsonb_build_object('miembro_id', tomi, 'monto', 120000), jsonb_build_object('miembro_id', caro, 'monto', 120000)));
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, categoria_id, cuenta_id, nota, gasto_grupo_id)
  values (uid, f, 'gasto', 120000, 'ARS', g_viajes, c_grupo, 'Cabaña', gasto);
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, cuenta_id, cuenta_destino_id, nota, gasto_grupo_id)
  values (uid, f, 'transferencia', 480000, 'ARS', c_visa, c_grupo, 'Cabaña', gasto);

  gasto := public.guardar_gasto_grupo(null, gr, 'Súper para el finde', f + 1, 96000, 'ARS', juli, 'iguales',
    jsonb_build_array(jsonb_build_object('miembro_id', yo, 'monto', 24000), jsonb_build_object('miembro_id', juli, 'monto', 24000),
                      jsonb_build_object('miembro_id', tomi, 'monto', 24000), jsonb_build_object('miembro_id', caro, 'monto', 24000)));
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, categoria_id, cuenta_id, nota, gasto_grupo_id)
  values (uid, f + 1, 'gasto', 24000, 'ARS', g_super, c_grupo, 'Súper para el finde', gasto);

  gasto := public.guardar_gasto_grupo(null, gr, 'Nafta ida y vuelta', f + 2, 140000, 'ARS', tomi, 'iguales',
    jsonb_build_array(jsonb_build_object('miembro_id', yo, 'monto', 35000), jsonb_build_object('miembro_id', juli, 'monto', 35000),
                      jsonb_build_object('miembro_id', tomi, 'monto', 35000), jsonb_build_object('miembro_id', caro, 'monto', 35000)));
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, categoria_id, cuenta_id, nota, gasto_grupo_id)
  values (uid, f + 2, 'gasto', 35000, 'ARS', g_auto, c_grupo, 'Nafta ida y vuelta', gasto);

  -- Caro ya le pagó su parte de la cabaña.
  insert into public.liquidaciones (grupo_id, de_miembro, a_miembro, monto, moneda, fecha, creado_por)
  values (gr, caro, yo, 120000, 'ARS', f + 3, uid) returning id into gasto;
  insert into public.movimientos (usuario_id, fecha, tipo, monto, moneda, cuenta_id, cuenta_destino_id, nota, liquidacion_id)
  values (uid, f + 3, 'transferencia', 120000, 'ARS', c_grupo, c_mp, 'Caro me pagó la cabaña', gasto);
end;
$$;
revoke all on function public.crear_demo() from public, anon;
grant execute on function public.crear_demo() to authenticated;

-- ============================================================
-- 3) Lo que no se puede hacer desde la demo
-- ============================================================
-- Unirse a un grupo: ni la demo entra a grupos reales, ni alguien real entra a un grupo de demo.
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
  if public.es_demo(uid) then raise exception 'En la demo no podés unirte a grupos. Creá tu cuenta para usarlos con tus amigos.' using errcode = '42501'; end if;
  select id, nombre into g, gnom from public.grupos where invitacion_token = p_token;
  if g is null then raise exception 'La invitación no es válida' using errcode = '22023'; end if;
  if exists (select 1 from public.grupos where id = g and public.es_demo(coalesce(admin_id, creado_por))) then
    raise exception 'Ese grupo es de la demo' using errcode = '22023';
  end if;
  if exists (select 1 from public.grupo_miembros where grupo_id = g and usuario_id = uid and removido_at is null) then
    return g;
  end if;
  if exists (select 1 from public.grupo_miembros where grupo_id = g and usuario_id = uid and removido_at is not null) then
    update public.grupo_miembros set removido_at = null, unido_at = now() where grupo_id = g and usuario_id = uid;
  elsif p_invitado is not null then
    update public.grupo_miembros set usuario_id = uid, unido_at = now()
     where id = p_invitado and grupo_id = g and usuario_id is null and removido_at is null;
    if not found then raise exception 'Ese invitado ya no está disponible' using errcode = '22023'; end if;
  else
    select coalesce(nullif(nombre, ''), 'Nuevo miembro') into nom from public.perfiles where id = uid;
    insert into public.grupo_miembros (grupo_id, usuario_id, nombre, unido_at) values (g, uid, nom, now());
  end if;
  update public.grupos set admin_id = uid where id = g and admin_id is null;
  perform public.asegurar_cuenta_grupo(g, uid);
  for r in select usuario_id from public.grupo_miembros where grupo_id = g and usuario_id is not null and usuario_id <> uid and removido_at is null loop
    perform public.notificar(r.usuario_id, g, gnom, public.mi_nombre_en(g) || ' se unió al grupo', 'union');
  end loop;
  return g;
end;
$$;

-- Notificaciones push: no para la demo.
create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  if public.es_demo() then raise exception 'En la demo no hay notificaciones' using errcode = '42501'; end if;
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth, creado_at = now();
end;
$$;

-- ============================================================
-- 4) Borrado de las demos de más de 24 horas (con todo lo que cargaron)
-- ============================================================
create or replace function public.borrar_demos_viejas()
returns int language plpgsql security definer set search_path = '' as $$
declare
  u record;
  mm record;
  n int := 0;
begin
  perform set_config('app.sin_avisos', '1', true);
  for u in select id from auth.users where is_anonymous and created_at < now() - interval '24 hours' loop
    for mm in select id from public.grupo_miembros where usuario_id = u.id loop
      perform public.quitar_miembro(mm.id);
    end loop;
    delete from auth.users where id = u.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.borrar_demos_viejas() from public, anon, authenticated;

-- Cada hora (minuto 17). Si ya estaba programado, se actualiza.
create extension if not exists pg_cron;
select cron.schedule('borrar-demos', '17 * * * *', $$select public.borrar_demos_viejas()$$);
