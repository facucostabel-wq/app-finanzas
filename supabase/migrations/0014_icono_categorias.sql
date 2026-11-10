-- Ícono elegido por el usuario para cada categoría (null = automático según el nombre).
alter table public.categorias add column if not exists icono text
  check (icono is null or icono ~ '^[a-z0-9-]{1,40}$');
grant insert (icono) on public.categorias to authenticated;
grant update (icono) on public.categorias to authenticated;
