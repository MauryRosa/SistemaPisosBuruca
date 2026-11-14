-- Los productos configurados por caja deben salir en cajas completas
-- en ventas, despachos y cambios. La política se aplica también fuera del UI.
create or replace function private.validar_modo_despacho_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_documento public.tipo_documento;
  v_tipo_producto public.tipo_producto;
  v_modo public.modo_despacho;
  v_piezas_por_caja integer;
begin
  select d.tipo into v_tipo_documento
  from public.documentos d
  where d.id = new.documento_id;

  if v_tipo_documento is null
     or v_tipo_documento not in ('salida_venta', 'despacho_minibodega', 'entrada_cambio', 'salida_cambio')
     or new.ubicacion_origen_id is null then
    return new;
  end if;

  select p.tipo, p.despacho_por, p.piezas_por_caja
  into v_tipo_producto, v_modo, v_piezas_por_caja
  from public.productos p
  where p.id = new.producto_id;

  if not found or v_tipo_producto <> 'piso' or v_modo <> 'caja' then
    return new;
  end if;

  if v_piezas_por_caja is null
     or v_piezas_por_caja <= 0
     or mod(new.cantidad, v_piezas_por_caja) <> 0 then
    raise exception 'El producto % solo puede despacharse por cajas completas.', new.producto_id;
  end if;

  return new;
end;
$$;

revoke all on function private.validar_modo_despacho_documento() from public, anon, authenticated;

create trigger detalle_documento_validar_modo_despacho
  before insert or update of documento_id, producto_id, ubicacion_origen_id, cantidad
  on public.detalle_documento
  for each row execute function private.validar_modo_despacho_documento();
