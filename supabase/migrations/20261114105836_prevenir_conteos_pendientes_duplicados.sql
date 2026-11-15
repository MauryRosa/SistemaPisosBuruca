-- Evita aplicar dos capturas pendientes basadas en el mismo stock de una ubicación.
create or replace function private.validar_conteo_pendiente_por_ubicacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('conteo_pendiente_ubicacion:' || new.ubicacion_id::text, 0)
  );

  if exists (
    select 1
    from public.conteos c
    where c.ubicacion_id = new.ubicacion_id
      and c.estado = 'pendiente'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Ya existe un conteo pendiente para esta ubicacion.';
  end if;

  return new;
end;
$$;

create trigger conteos_un_pendiente_por_ubicacion
  before insert on public.conteos
  for each row execute function private.validar_conteo_pendiente_por_ubicacion();

revoke all on function private.validar_conteo_pendiente_por_ubicacion() from public, anon, authenticated;
