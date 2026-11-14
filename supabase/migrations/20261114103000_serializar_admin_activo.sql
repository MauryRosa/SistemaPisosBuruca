-- Serializa cambios de rol/estado que podrían dejar el sistema sin admin activo.
create table if not exists private.control_administrador_activo (
  id boolean primary key default true check (id),
  version bigint not null default 0
);

insert into private.control_administrador_activo (id, version)
values (true, 0)
on conflict (id) do nothing;

revoke all on table private.control_administrador_activo from public, anon, authenticated;

create or replace function private.proteger_administrador_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activo and old.id = (select auth.uid()) and not new.activo then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;

  if old.activo and old.rol = 'administrador'
     and (not new.activo or new.rol <> 'administrador') then
    -- El UPDATE del guard row bloquea y crea conflicto de escritura si el
    -- aislamiento conserva una instantánea anterior a otro cambio concurrente.
    update private.control_administrador_activo
    set version = version + 1
    where id;

    if not found then
      raise exception 'No se pudo validar la protección del administrador activo.';
    end if;

    if not exists (
      select 1 from public.usuarios u
      where u.id <> old.id and u.activo and u.rol = 'administrador'
    ) then
      raise exception 'Debe quedar al menos un administrador activo.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.proteger_administrador_activo() from public, anon, authenticated;
