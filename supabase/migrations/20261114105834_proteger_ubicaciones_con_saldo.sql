create or replace function private.proteger_ubicacion_con_saldo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_requiere_vacia boolean := false;
begin
  if v_usuario is not null and not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo un administrador activo puede cambiar una ubicacion.';
  end if;

  v_requiere_vacia :=
    (old.activa and not new.activa)
    or (new.tipo, new.vendible) is distinct from (old.tipo, old.vendible);

  if v_requiere_vacia and (
    exists (
      select 1 from public.existencias e
      where e.ubicacion_id = old.id and e.cantidad > 0
    )
    or exists (
      select 1 from public.reservas r
      where r.ubicacion_id = old.id and r.estado = 'activa'
    )
    or exists (
      select 1
      from public.detalle_documento dd
      join public.documentos d on d.id = dd.documento_id
      where old.id in (dd.ubicacion_origen_id, dd.ubicacion_destino_id)
        and d.estado = 'pendiente'
    )
  ) then
    raise exception 'La ubicacion conserva existencias, reservas o movimientos pendientes.';
  end if;

  return new;
end;
$$;

revoke all on function private.proteger_ubicacion_con_saldo() from public, anon, authenticated;

create trigger ubicaciones_proteger_cambios_con_saldo
  before update of activa, tipo, vendible on public.ubicaciones
  for each row execute function private.proteger_ubicacion_con_saldo();
