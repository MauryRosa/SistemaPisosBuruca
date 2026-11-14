-- La observación de sobrante también se valida en la base, aunque el RPC se
-- invoque sin pasar por el formulario de recepción.
create or replace function private.requerir_observacion_sobrante_compra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden_id bigint;
  v_estado public.estado_pedido;
  v_cantidad_ordenada bigint;
  v_cantidad_recibida bigint;
  v_cantidad_documento bigint;
begin
  select d.orden_pedido_id into v_orden_id
  from public.documentos d
  where d.id = new.documento_id and d.tipo = 'entrada_compra';

  if not found then
    return new;
  end if;

  if v_orden_id is null then
    raise exception 'La recepción de compra debe indicar una orden de pedido.';
  end if;

  -- Serializa todas las recepciones concurrentes de la misma orden.
  select op.estado into v_estado
  from public.ordenes_pedido op
  where op.id = v_orden_id
  for update;

  if not found or v_estado not in ('abierta', 'parcial') then
    raise exception 'La orden de pedido no existe o ya fue cerrada.';
  end if;

  if new.detalle_orden_pedido_id is null then
    raise exception 'Cada línea recibida debe indicar su línea de orden de pedido.';
  end if;

  select dop.cantidad, dop.cantidad_recibida
  into v_cantidad_ordenada, v_cantidad_recibida
  from public.detalle_orden_pedido dop
  where dop.id = new.detalle_orden_pedido_id
    and dop.orden_pedido_id = v_orden_id
    and dop.producto_id = new.producto_id
  for update;

  if not found then
    raise exception 'La línea recibida no pertenece a la orden de pedido indicada.';
  end if;

  select coalesce(sum(dd.cantidad), 0)
  into v_cantidad_documento
  from public.detalle_documento dd
  where dd.documento_id = new.documento_id
    and dd.detalle_orden_pedido_id = new.detalle_orden_pedido_id;

  if v_cantidad_recibida + v_cantidad_documento + new.cantidad > v_cantidad_ordenada
     and nullif(btrim(new.observacion), '') is null then
    raise exception 'El sobrante de la orden requiere una observación.';
  end if;

  return new;
end;
$$;
revoke all on function private.requerir_observacion_sobrante_compra() from public, anon, authenticated;

create trigger detalle_documento_observacion_sobrante_compra
before insert on public.detalle_documento
for each row execute function private.requerir_observacion_sobrante_compra();
