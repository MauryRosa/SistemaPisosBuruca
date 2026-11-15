-- Valida que una devolución pertenezca a una venta aprobada y limita sus
-- cantidades acumuladas a lo que realmente salió en el comprobante original.
create or replace function private.validar_cabecera_devolucion_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_documento;
  v_estado public.estado_documento;
  v_venta_tipo public.doc_venta;
  v_venta_numero text;
begin
  if tg_op = 'UPDATE'
     and old.tipo in ('salida_venta', 'despacho_minibodega')
     and new.estado = 'anulado'
     and exists (
       select 1 from public.documentos d
       where d.tipo = 'entrada_devolucion_cliente'
         and d.documento_origen_id = old.id
         and d.estado in ('pendiente', 'aprobado')
     ) then
    raise exception 'Anule las devoluciones vinculadas antes de anular la venta original.';
  end if;

  if new.tipo <> 'entrada_devolucion_cliente' then
    return new;
  end if;

  if new.documento_origen_id is null
     or new.doc_venta_tipo is null
     or nullif(btrim(new.doc_venta_numero), '') is null
     or nullif(btrim(new.motivo), '') is null then
    raise exception 'La devolución requiere comprobante original, número y motivo.';
  end if;

  select d.tipo, d.estado, d.doc_venta_tipo, d.doc_venta_numero
    into v_tipo, v_estado, v_venta_tipo, v_venta_numero
  from public.documentos d
  where d.id = new.documento_origen_id
  for update;

  if not found
     or v_tipo not in ('salida_venta', 'despacho_minibodega')
     or v_estado <> 'aprobado' then
    raise exception 'La devolución debe vincularse a una salida aprobada.';
  end if;

  if new.doc_venta_tipo is distinct from v_venta_tipo
     or btrim(new.doc_venta_numero) is distinct from v_venta_numero then
    raise exception 'El comprobante no coincide con la venta original.';
  end if;

  return new;
end;
$$;

create or replace function private.validar_detalle_devolucion_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento public.documentos%rowtype;
  v_vendido integer;
  v_devuelto integer;
  v_detalle_excluir bigint;
begin
  if tg_op = 'UPDATE' then
    v_detalle_excluir := old.id;
  end if;

  select d.* into v_documento
  from public.documentos d
  where d.id = new.documento_id;

  if not found or v_documento.tipo <> 'entrada_devolucion_cliente' then
    return new;
  end if;

  if new.ubicacion_origen_id is not null or new.ubicacion_destino_id is null then
    raise exception 'La devolución de cliente debe entrar a una ubicación.';
  end if;

  perform 1 from public.documentos d
  where d.id = v_documento.documento_origen_id
  for update;

  select coalesce(sum(dd.cantidad), 0)::integer into v_vendido
  from public.detalle_documento dd
  where dd.documento_id = v_documento.documento_origen_id
    and dd.producto_id = new.producto_id
    and dd.ubicacion_origen_id is not null;

  select coalesce(sum(dd.cantidad), 0)::integer into v_devuelto
  from public.detalle_documento dd
  join public.documentos d on d.id = dd.documento_id
  where d.tipo = 'entrada_devolucion_cliente'
    and d.documento_origen_id = v_documento.documento_origen_id
    and d.estado in ('pendiente', 'aprobado')
    and dd.producto_id = new.producto_id
    and (v_detalle_excluir is null or dd.id <> v_detalle_excluir);

  if v_vendido = 0 or v_devuelto + new.cantidad > v_vendido then
    raise exception 'La cantidad devuelta supera lo vendido del producto %.', new.producto_id;
  end if;

  return new;
end;
$$;

revoke all on function private.validar_cabecera_devolucion_cliente() from public, anon, authenticated;
revoke all on function private.validar_detalle_devolucion_cliente() from public, anon, authenticated;

create trigger documentos_validar_devolucion_cliente
  before insert or update of tipo, estado, documento_origen_id, doc_venta_tipo, doc_venta_numero, motivo
  on public.documentos
  for each row execute function private.validar_cabecera_devolucion_cliente();

create trigger detalle_validar_devolucion_cliente
  before insert or update of documento_id, producto_id, cantidad, ubicacion_origen_id, ubicacion_destino_id
  on public.detalle_documento
  for each row execute function private.validar_detalle_devolucion_cliente();
