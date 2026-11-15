-- Endurecimiento de permisos tras la auditoría de seguridad (run-1).
-- 1) TRUNCATE, REFERENCES y TRIGGER no deben quedar concedidos a los roles de la API:
--    TRUNCATE ignora RLS y las tablas de catálogo/usuarios/reservas conservaban el privilegio por defecto.
revoke truncate, references, trigger on table
  public.usuarios, public.proveedores, public.productos, public.ubicaciones, public.reservas
from anon, authenticated;

-- 2) La interfaz ya no usa los cambios de fila de reservas (solo un aviso de invalidación por broadcast);
--    se retira de la publicación para reducir superficie y costo de autorización por cambio.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservas'
  ) then
    alter publication supabase_realtime drop table public.reservas;
  end if;
end $$;

-- 3) La apertura de caja no tenía tope de líneas por llamada (movimientos sí).
create or replace function public.registrar_apertura_caja(
  p_ubicacion_id bigint,
  p_detalles jsonb,
  p_es_contingencia boolean
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_array_length(
    case when jsonb_typeof(p_detalles) = 'array' then p_detalles else '[]'::jsonb end
  ) > 1000 then
    raise exception 'Una apertura de caja admite como máximo 1,000 líneas.';
  end if;

  return private.registrar_apertura_caja_core(p_ubicacion_id, p_detalles, p_es_contingencia);
end;
$$;

revoke all on function public.registrar_apertura_caja(bigint, jsonb, boolean) from public, anon;
grant execute on function public.registrar_apertura_caja(bigint, jsonb, boolean) to authenticated;

-- 4) Consistencia: la función del trigger de bitácora no debe ser invocable por los roles de la API
--    (los demás triggers definer del esquema private ya la tienen revocada).
revoke all on function private.registrar_bitacora() from public, anon, authenticated;
