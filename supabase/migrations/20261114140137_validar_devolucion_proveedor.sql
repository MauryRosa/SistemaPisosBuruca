-- Una devolución a proveedor solo puede descontar cantidades recibidas en
-- la recepción indicada, considerando también devoluciones aún pendientes.
create or replace function private.validar_cabecera_devolucion_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.tipo_documento;
  v_estado public.estado_documento;
begin
  if tg_op = 'UPDATE'
     and (old.tipo is distinct from new.tipo
       or old.documento_origen_id is distinct from new.documento_origen_id)
     and (old.tipo = 'devolucion_proveedor' or new.tipo = 'devolucion_proveedor')
     and exists (
       select 1 from public.detalle_documento dd
       where dd.documento_id = old.id
     ) then
    raise exception 'No se puede cambiar el tipo o la recepcion de una devolucion que ya tiene lineas.';
  end if;

  if new.tipo <> 'devolucion_proveedor' then
    return new;
  end if;

  if new.documento_origen_id is null
     or nullif(btrim(new.doc_proveedor_numero), '') is null then
    raise exception 'La devolución requiere el documento del proveedor y la recepción original.';
  end if;

  select d.tipo, d.estado into v_tipo, v_estado
  from public.documentos d
  where d.id = new.documento_origen_id
  for update;

  if not found or v_tipo <> 'entrada_compra' or v_estado <> 'aprobado' then
    raise exception 'La devolución debe vincularse a una recepción aprobada de compra.';
  end if;

  return new;
end;
$$;

create or replace function private.validar_detalle_devolucion_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento public.documentos%rowtype;
  v_recibido bigint;
  v_devuelto bigint;
  v_detalle_excluir bigint;
begin
  if tg_op = 'UPDATE' then
    v_detalle_excluir := old.id;
  end if;

  select d.* into v_documento
  from public.documentos d
  where d.id = new.documento_id;

  if not found or v_documento.tipo <> 'devolucion_proveedor' then
    return new;
  end if;

  if new.ubicacion_origen_id is null or new.ubicacion_destino_id is not null then
    raise exception 'La devolución a proveedor debe salir de una ubicación.';
  end if;

  perform 1
  from public.documentos d
  where d.id = v_documento.documento_origen_id
    and d.tipo = 'entrada_compra'
    and d.estado = 'aprobado'
  for update;

  if not found then
    raise exception 'La devolución debe vincularse a una recepción aprobada de compra.';
  end if;

  select coalesce(sum(dd.cantidad), 0) into v_recibido
  from public.detalle_documento dd
  where dd.documento_id = v_documento.documento_origen_id
    and dd.producto_id = new.producto_id
    and dd.ubicacion_destino_id = new.ubicacion_origen_id;

  select coalesce(sum(dd.cantidad), 0) into v_devuelto
  from public.detalle_documento dd
  join public.documentos d on d.id = dd.documento_id
  where d.tipo = 'devolucion_proveedor'
    and d.documento_origen_id = v_documento.documento_origen_id
    and d.estado in ('pendiente', 'aprobado')
    and dd.producto_id = new.producto_id
    and dd.ubicacion_origen_id = new.ubicacion_origen_id
    and (v_detalle_excluir is null or dd.id <> v_detalle_excluir);

  if v_recibido = 0 or v_devuelto + new.cantidad > v_recibido then
    raise exception 'La devolución supera la cantidad recibida del producto % en esa ubicación.', new.producto_id;
  end if;

  return new;
end;
$$;

-- La validacion AFTER ve todas las lineas insertadas por la misma sentencia,
-- incluidas lineas repetidas para el mismo producto y ubicacion.
create or replace function private.validar_total_devolucion_proveedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento public.documentos%rowtype;
  v_recibido bigint;
  v_devuelto bigint;
begin
  select d.* into v_documento
  from public.documentos d
  where d.id = new.documento_id;

  if not found or v_documento.tipo <> 'devolucion_proveedor' then
    return null;
  end if;

  select coalesce(sum(dd.cantidad), 0) into v_recibido
  from public.detalle_documento dd
  where dd.documento_id = v_documento.documento_origen_id
    and dd.producto_id = new.producto_id
    and dd.ubicacion_destino_id = new.ubicacion_origen_id;

  select coalesce(sum(dd.cantidad), 0) into v_devuelto
  from public.detalle_documento dd
  join public.documentos d on d.id = dd.documento_id
  where d.tipo = 'devolucion_proveedor'
    and d.documento_origen_id = v_documento.documento_origen_id
    and d.estado in ('pendiente', 'aprobado')
    and dd.producto_id = new.producto_id
    and dd.ubicacion_origen_id = new.ubicacion_origen_id;

  if v_recibido = 0 or v_devuelto > v_recibido then
    raise exception 'La devolucion supera la cantidad recibida del producto % en esa ubicacion.', new.producto_id;
  end if;

  return null;
end;
$$;

revoke all on function private.validar_cabecera_devolucion_proveedor() from public, anon, authenticated;
revoke all on function private.validar_detalle_devolucion_proveedor() from public, anon, authenticated;
revoke all on function private.validar_total_devolucion_proveedor() from public, anon, authenticated;

create index documentos_devolucion_proveedor_origen_idx
  on public.documentos (documento_origen_id)
  where tipo = 'devolucion_proveedor' and estado in ('pendiente', 'aprobado');

create trigger documentos_validar_devolucion_proveedor
  before insert or update of tipo, documento_origen_id, doc_proveedor_numero
  on public.documentos
  for each row execute function private.validar_cabecera_devolucion_proveedor();

create trigger detalle_validar_devolucion_proveedor
  before insert or update of documento_id, producto_id, cantidad, ubicacion_origen_id, ubicacion_destino_id
  on public.detalle_documento
  for each row execute function private.validar_detalle_devolucion_proveedor();

create trigger detalle_validar_total_devolucion_proveedor
  after insert or update of documento_id, producto_id, cantidad, ubicacion_origen_id, ubicacion_destino_id
  on public.detalle_documento
  for each row execute function private.validar_total_devolucion_proveedor();
