-- Etapa 1: perfiles de usuario con Row Level Security.
-- Ejecutar en Supabase → SQL Editor (una sola vez).

create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '' check (char_length(nombre) <= 80),
  consentimiento_at timestamptz,
  creado_at timestamptz not null default now()
);

-- Cada usuario ve y edita solo su propio perfil.
alter table public.perfiles enable row level security;

create policy "perfil: leer el propio"
  on public.perfiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "perfil: editar el propio"
  on public.perfiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No hay políticas de insert ni delete: el perfil lo crea el trigger de abajo
-- y se borra en cascada al eliminar el usuario.

-- El consentimiento no se puede modificar desde la app una vez registrado.
revoke update on public.perfiles from authenticated, anon;
grant update (nombre) on public.perfiles to authenticated;

-- Crea el perfil automáticamente al registrarse, con el nombre y la fecha
-- de aceptación de la política de privacidad enviados en el alta.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, consentimiento_at)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'nombre', ''), 80),
    (new.raw_user_meta_data ->> 'consentimiento_at')::timestamptz
  );
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();
