-- Borrar la propia cuenta (derecho de supresión, Ley 25.326).
--
-- Qué se borra: el usuario, su perfil y todo lo personal (cuentas, movimientos,
-- categorías, cuotas, saldos, avisos y suscripciones push), por "on delete cascade".
-- Qué queda: en los grupos compartidos, los gastos y pagos siguen existiendo para los
-- demás miembros; la persona pasa a figurar como invitado con su nombre (sin cuenta).
-- Los grupos donde ya no queda nadie con cuenta se borran enteros.
-- Se puede ejecutar más de una vez.

-- Para que el borrado no se trabe con lo que la persona cargó en grupos ajenos.
alter table public.grupos alter column creado_por drop not null;
alter table public.grupos drop constraint if exists grupos_creado_por_fkey;
alter table public.grupos add constraint grupos_creado_por_fkey
  foreign key (creado_por) references public.perfiles (id) on delete set null;

alter table public.gastos_grupo alter column creado_por drop not null;
alter table public.gastos_grupo drop constraint if exists gastos_grupo_creado_por_fkey;
alter table public.gastos_grupo add constraint gastos_grupo_creado_por_fkey
  foreign key (creado_por) references public.perfiles (id) on delete set null;

alter table public.liquidaciones alter column creado_por drop not null;
alter table public.liquidaciones drop constraint if exists liquidaciones_creado_por_fkey;
alter table public.liquidaciones add constraint liquidaciones_creado_por_fkey
  foreign key (creado_por) references public.perfiles (id) on delete set null;

create or replace function public.borrar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mis_grupos uuid[];
  huerfanos uuid[];
begin
  if uid is null then raise exception 'Tenés que estar logueado' using errcode = '42501'; end if;
  select coalesce(array_agg(grupo_id), '{}') into mis_grupos from public.grupo_miembros where usuario_id = uid;

  -- Borra el usuario; el resto cae en cascada.
  delete from auth.users where id = uid;

  -- Grupos que quedaron sin ningún miembro con cuenta: no le sirven a nadie.
  -- (Sin avisos: no queda nadie a quien avisar.)
  select coalesce(array_agg(g.id), '{}') into huerfanos
    from public.grupos g
   where g.id = any (mis_grupos)
     and not exists (select 1 from public.grupo_miembros m where m.grupo_id = g.id and m.usuario_id is not null);
  -- En orden, porque divisiones y pagos apuntan a los miembros.
  delete from public.liquidaciones where grupo_id = any (huerfanos);
  delete from public.gastos_grupo where grupo_id = any (huerfanos);
  delete from public.grupos where id = any (huerfanos);
end;
$$;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;
