-- Etapa 1b: login con Google y consentimiento para cuentas creadas sin el formulario.
-- Ejecutar en Supabase → SQL Editor (una sola vez), después de 0001.

-- 1) El perfil toma el nombre de Google si la cuenta se creó con Google
--    (Google lo envía como full_name / name en lugar de nombre).
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
    left(coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      ''
    ), 80),
    (new.raw_user_meta_data ->> 'consentimiento_at')::timestamptz
  );
  return new;
end;
$$;

-- 2) Quien entra con Google no pasó por la casilla de aceptación del registro.
--    La app le pide aceptar la política y registra la fecha con esta función.
--    Solo puede completar SU consentimiento, y una única vez (no se puede reescribir).
create or replace function public.aceptar_politica()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.perfiles
     set consentimiento_at = now()
   where id = (select auth.uid())
     and consentimiento_at is null;
$$;

revoke all on function public.aceptar_politica() from public, anon;
grant execute on function public.aceptar_politica() to authenticated;
