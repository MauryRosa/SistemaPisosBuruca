create or replace function private.proteger_producto_operativo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activo and not new.activo and (
    exists (select 1 from public.existencias e where e.producto_id = old.id and e.cantidad > 0)
    or exists (select 1 from public.reservas r where r.producto_id = old.id and r.estado = 'activa')
    or exists (
      select 1 from public.detalle_documento dd
      join public.documentos d on d.id = dd.documento_id
      where dd.producto_id = old.id and d.estado = 'pendiente'
    )
    or exists (
      select 1 from public.detalle_documento dd
      join public.documentos d on d.id = dd.documento_id
      where dd.producto_id = old.id
        and d.tipo = 'traslado' and d.estado = 'aprobado'
        and d.traslado_confirmado_en is null
    )
    or exists (
      select 1 from public.detalle_orden_pedido dop
      join public.ordenes_pedido op on op.id = dop.orden_pedido_id
      where dop.producto_id = old.id and op.estado in ('abierta', 'parcial')
    )
    or exists (
      select 1 from public.detalle_conteo dc
      join public.conteos c on c.id = dc.conteo_id
      where dc.producto_id = old.id and c.estado = 'pendiente'
    )
  ) then
    raise exception 'El producto participa en stock, reservas o documentos abiertos y no se puede desactivar.';
  end if;

  if (new.tipo, new.unidad, new.piezas_por_caja) is distinct from (old.tipo, old.unidad, old.piezas_por_caja)
     and (
       exists (select 1 from public.existencias e where e.producto_id = old.id and e.cantidad > 0)
       or exists (select 1 from public.detalle_documento dd where dd.producto_id = old.id)
       or exists (select 1 from public.detalle_orden_pedido dop where dop.producto_id = old.id)
       or exists (select 1 from public.detalle_conteo dc where dc.producto_id = old.id)
     ) then
    raise exception 'El tipo, unidad o empaque no se puede cambiar después de registrar movimientos o stock.';
  end if;

  if new.despacho_por is distinct from old.despacho_por and exists (
    select 1 from public.detalle_documento dd
    join public.documentos d on d.id = dd.documento_id
    where dd.producto_id = old.id and d.estado = 'pendiente'
  ) then
    raise exception 'El modo de despacho no se puede cambiar mientras haya movimientos pendientes.';
  end if;
  return new;
end;
$$;

create trigger productos_proteger_operacion
  before update of activo, tipo, unidad, piezas_por_caja, despacho_por on public.productos
  for each row execute function private.proteger_producto_operativo();

revoke all on function private.proteger_producto_operativo() from public, anon, authenticated;
