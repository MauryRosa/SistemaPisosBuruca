-- Cada evidencia debe ser un objeto privado subido por quien registra el movimiento.
create or replace function private.validar_evidencia_movimiento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.evidencia_url is null then
    return new;
  end if;

  if new.creado_por is null
     or new.evidencia_url !~ format(
       '^%s/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|pdf)$',
       new.creado_por
     )
     or not exists (
       select 1
       from storage.objects objeto
       where objeto.bucket_id = 'evidencias-movimientos'
         and objeto.name = new.evidencia_url
     ) then
    raise exception 'La evidencia debe ser un archivo privado cargado por quien registra el movimiento.';
  end if;

  return new;
end;
$$;
revoke all on function private.validar_evidencia_movimiento() from public, anon, authenticated;

create trigger documentos_validar_evidencia_privada
before insert or update of evidencia_url, creado_por on public.documentos
for each row execute function private.validar_evidencia_movimiento();
