-- Destinar a un objetivo solo una moneda de una cuenta (por ejemplo, solo los dólares de
-- Galicia). moneda = null sigue siendo "la cuenta entera, todas sus monedas".
-- Se puede ejecutar más de una vez.

alter table public.objetivo_vinculos add column if not exists moneda text
  check (moneda is null or moneda ~ '^[A-Z]{3}$');
alter table public.objetivo_vinculos drop constraint if exists objetivo_vinculos_moneda_solo_cuenta;
alter table public.objetivo_vinculos add constraint objetivo_vinculos_moneda_solo_cuenta
  check (moneda is null or cuenta_id is not null);

-- Antes: una cuenta, un solo vínculo. Ahora: la cuenta entera O cada moneda por separado.
drop index if exists public.objetivo_vinculos_cuenta;
create unique index if not exists objetivo_vinculos_cuenta_entera on public.objetivo_vinculos (cuenta_id)
  where cuenta_id is not null and moneda is null;
create unique index if not exists objetivo_vinculos_cuenta_moneda on public.objetivo_vinculos (cuenta_id, moneda)
  where cuenta_id is not null and moneda is not null;

-- La cuenta entera y una de sus monedas no pueden estar destinadas a la vez.
create or replace function public.validar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cuenta_id is not null and exists (
    select 1 from public.objetivo_vinculos v
    where v.cuenta_id = new.cuenta_id and v.id <> new.id
      and (v.moneda is null or new.moneda is null or v.moneda = new.moneda)
  ) then
    raise exception 'Esa plata ya está destinada a un objetivo' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists validar_vinculo on public.objetivo_vinculos;
create trigger validar_vinculo before insert or update on public.objetivo_vinculos
  for each row execute function public.validar_vinculo();
