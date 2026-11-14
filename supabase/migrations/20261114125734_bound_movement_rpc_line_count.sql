-- Limita el trabajo que un usuario autenticado puede hacer en una sola
-- llamada RPC; la interfaz de movimientos no envía más de 1,000 líneas.
create or replace function public.registrar_movimiento(
  p_tipo public.tipo_documento,
  p_cabecera jsonb,
  p_detalles jsonb
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
    raise exception 'Un movimiento admite como máximo 1,000 líneas.';
  end if;

  return private.registrar_movimiento_core(p_tipo, p_cabecera, p_detalles);
end;
$$;
