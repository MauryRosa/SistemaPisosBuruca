-- Hallazgo de la auditoría (run-2): entrada_cambio/salida_cambio se aplicaban al instante sin cuadrar
-- cantidades, de modo que un jefe de bodega podía subir stock sin la aprobación que exigen los ajustes.
-- Se conserva el flujo normal de RF-24 (cambio balanceado se aplica de inmediato) y se envía a aprobación
-- el cambio con diferencia neta de unidades. El resto de la función es idéntico a 20261114105808.
create or replace function private.registrar_movimiento_core(
  p_tipo public.tipo_documento,
  p_cabecera jsonb,
  p_detalles jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_rol public.rol_usuario;
  v_serie text;
  v_anio integer := extract(year from now() at time zone 'America/El_Salvador')::integer;
  v_correlativo integer;
  v_documento_id bigint;
  v_venta_tipo public.doc_venta;
  v_venta_numero text;
  v_proveedor_numero text;
  v_orden_id bigint;
  v_origen_id bigint;
  v_motivo text;
  v_retira text;
  v_placa text;
  v_evidencia text;
  v_contingencia boolean := false;
  v_pendiente boolean;
  v_linea jsonb;
  v_producto_id bigint;
  v_cantidad integer;
  v_detalle_orden_id bigint;
  v_origen bigint;
  v_destino bigint;
  v_tipo_origen public.tipo_ubicacion;
  v_tipo_destino public.tipo_ubicacion;
  v_producto_tipo public.tipo_producto;
  v_lineas_entrada integer := 0;
  v_lineas_salida integer := 0;
begin
  if v_usuario is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  select u.rol into v_rol
  from public.usuarios u
  where u.id = v_usuario and u.activo;

  if v_rol is null or v_rol not in ('administrador', 'jefe_bodega') then
    raise exception 'El usuario no tiene permiso para registrar movimientos.';
  end if;

  if p_tipo is null or p_tipo not in (
    'entrada_compra', 'entrada_devolucion_cliente', 'entrada_cambio',
    'inventario_inicial', 'salida_venta', 'despacho_minibodega', 'traslado',
    'merma', 'consumo_interno', 'devolucion_proveedor', 'salida_cambio',
    'ajuste_positivo', 'ajuste_negativo'
  ) then
    raise exception 'Este tipo de movimiento requiere un flujo especializado.';
  end if;

  if jsonb_typeof(p_cabecera) is distinct from 'object'
     or jsonb_typeof(p_detalles) is distinct from 'array'
     or jsonb_array_length(
       case when jsonb_typeof(p_detalles) = 'array' then p_detalles else '[]'::jsonb end
     ) = 0 then
    raise exception 'El movimiento requiere cabecera y al menos una linea.';
  end if;

  v_venta_tipo := nullif(p_cabecera ->> 'doc_venta_tipo', '')::public.doc_venta;
  v_venta_numero := nullif(btrim(p_cabecera ->> 'doc_venta_numero'), '');
  v_proveedor_numero := nullif(btrim(p_cabecera ->> 'doc_proveedor_numero'), '');
  v_orden_id := nullif(p_cabecera ->> 'orden_pedido_id', '')::bigint;
  v_origen_id := nullif(p_cabecera ->> 'documento_origen_id', '')::bigint;
  v_motivo := nullif(btrim(p_cabecera ->> 'motivo'), '');
  v_retira := nullif(btrim(p_cabecera ->> 'retira_nombre'), '');
  v_placa := nullif(btrim(p_cabecera ->> 'placa'), '');
  v_evidencia := nullif(btrim(p_cabecera ->> 'evidencia_url'), '');
  v_contingencia := coalesce((p_cabecera ->> 'es_contingencia')::boolean, false);

  if p_tipo in ('salida_venta', 'despacho_minibodega', 'entrada_cambio', 'salida_cambio')
     and (v_venta_tipo is null or v_venta_numero is null) then
    raise exception 'Indique el tipo y numero del documento de venta o cambio.';
  end if;

  if p_tipo in ('salida_venta', 'despacho_minibodega') and v_retira is null then
    raise exception 'Indique quien retira el producto.';
  end if;

  if p_tipo = 'consumo_interno' and v_motivo is null then
    raise exception 'Indique el motivo del consumo interno.';
  end if;

  if p_tipo = 'entrada_compra' and (v_orden_id is null or v_proveedor_numero is null) then
    raise exception 'La recepcion requiere una orden de pedido y factura o remision.';
  end if;

  if p_tipo = 'devolucion_proveedor'
     and (v_proveedor_numero is null or v_origen_id is null) then
    raise exception 'La devolucion requiere el documento del proveedor y la recepcion original.';
  end if;

  if p_tipo = 'devolucion_proveedor' and not exists (
    select 1 from public.documentos d
    where d.id = v_origen_id and d.tipo = 'entrada_compra' and d.estado = 'aprobado'
  ) then
    raise exception 'El documento de origen debe ser una recepcion aprobada de compra.';
  end if;

  if p_tipo in ('merma', 'ajuste_positivo', 'ajuste_negativo') and v_motivo is null then
    raise exception 'Indique el motivo del movimiento.';
  end if;

  if p_tipo = 'merma' and v_evidencia is null then
    raise exception 'La merma requiere la carta firmada como evidencia.';
  end if;

  if p_tipo in ('salida_venta', 'despacho_minibodega') and v_evidencia is null then
    raise exception 'La salida requiere una firma o foto como evidencia de entrega.';
  end if;

  if p_tipo = 'entrada_compra' and not exists (
    select 1 from public.ordenes_pedido op
    where op.id = v_orden_id and op.estado in ('abierta', 'parcial')
  ) then
    raise exception 'La orden de pedido no existe o ya fue cerrada.';
  end if;

  v_lineas_entrada := 0;
  v_lineas_salida := 0;
  for v_linea in
    select value from jsonb_array_elements(p_detalles)
    order by (value ->> 'producto_id')::bigint
  loop
    if jsonb_typeof(v_linea) is distinct from 'object' then
      raise exception 'Cada linea debe ser un objeto.';
    end if;

    v_producto_id := nullif(v_linea ->> 'producto_id', '')::bigint;
    v_cantidad := nullif(v_linea ->> 'cantidad', '')::integer;
    v_origen := nullif(v_linea ->> 'ubicacion_origen_id', '')::bigint;
    v_destino := nullif(v_linea ->> 'ubicacion_destino_id', '')::bigint;
    v_detalle_orden_id := nullif(v_linea ->> 'detalle_orden_pedido_id', '')::bigint;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0
       or (v_origen is null and v_destino is null)
       or (v_origen is not null and v_origen = v_destino) then
      raise exception 'Cada linea requiere producto, cantidad positiva y ubicacion valida.';
    end if;

    select p.tipo into v_producto_tipo
    from public.productos p
    where p.id = v_producto_id and p.activo
    for share;
    if v_producto_tipo is null then
      raise exception 'El producto % no existe o esta inactivo.', v_producto_id;
    end if;

    if p_tipo = 'entrada_compra' then
      if v_detalle_orden_id is null or not exists (
        select 1 from public.detalle_orden_pedido dop
        where dop.id = v_detalle_orden_id
          and dop.orden_pedido_id = v_orden_id
          and dop.producto_id = v_producto_id
      ) then
        raise exception 'Cada linea recibida debe coincidir con un producto de la orden de pedido.';
      end if;
    elsif v_detalle_orden_id is not null then
      raise exception 'Solo las recepciones de compra se ligan a una linea de pedido.';
    end if;

    if v_origen is not null then
      select u.tipo into v_tipo_origen
      from public.ubicaciones u
      where u.id = v_origen and u.activa
      for share;
      if v_tipo_origen is null then
        raise exception 'La ubicacion de origen no existe o esta inactiva.';
      end if;
      v_lineas_salida := v_lineas_salida + 1;
    end if;

    if v_destino is not null then
      select u.tipo into v_tipo_destino
      from public.ubicaciones u
      where u.id = v_destino and u.activa
      for share;
      if v_tipo_destino is null then
        raise exception 'La ubicacion de destino no existe o esta inactiva.';
      end if;
      v_lineas_entrada := v_lineas_entrada + 1;
    end if;

    if p_tipo in ('entrada_compra', 'entrada_devolucion_cliente', 'inventario_inicial', 'ajuste_positivo')
       and (v_origen is not null or v_destino is null) then
      raise exception 'Este tipo de movimiento requiere lineas de entrada.';
    elsif p_tipo in ('salida_venta', 'despacho_minibodega', 'merma', 'consumo_interno', 'devolucion_proveedor', 'ajuste_negativo')
       and (v_origen is null or v_destino is not null) then
      raise exception 'Este tipo de movimiento requiere lineas de salida.';
    elsif p_tipo = 'traslado' and (v_origen is null or v_destino is null) then
      raise exception 'El traslado requiere origen y destino.';
    elsif p_tipo in ('entrada_cambio', 'salida_cambio') and v_origen is null and v_destino is null then
      raise exception 'El cambio requiere una entrada o una salida.';
    end if;

    if p_tipo in ('entrada_cambio', 'salida_cambio')
       and v_origen is not null and v_destino is not null then
      raise exception 'El cambio registra la devolucion y el reemplazo en lineas separadas.';
    end if;

    if p_tipo in ('entrada_compra', 'entrada_devolucion_cliente', 'inventario_inicial', 'entrada_cambio')
       and v_destino is not null and v_tipo_destino <> 'bodega' then
      raise exception 'La entrada debe recibirse en la bodega principal.';
    end if;

    if p_tipo in ('salida_venta', 'merma', 'consumo_interno', 'devolucion_proveedor', 'salida_cambio')
       and v_origen is not null and v_tipo_origen <> 'bodega' then
      raise exception 'La salida debe realizarse desde la bodega principal.';
    end if;

    if p_tipo in ('entrada_cambio', 'salida_cambio')
       and ((v_origen is not null and v_tipo_origen <> 'bodega')
         or (v_destino is not null and v_tipo_destino <> 'bodega')) then
      raise exception 'El cambio debe registrarse en la bodega principal.';
    end if;

    if p_tipo = 'despacho_minibodega' and v_tipo_origen <> 'minibodega' then
      raise exception 'El despacho debe salir de la minibodega.';
    end if;

    if p_tipo = 'traslado'
       and (v_tipo_origen <> 'bodega' or v_tipo_destino not in ('minibodega', 'exhibicion')) then
      raise exception 'El traslado debe salir de bodega hacia minibodega o exhibicion.';
    end if;
  end loop;

  if p_tipo in ('entrada_cambio', 'salida_cambio')
     and (v_lineas_entrada = 0 or v_lineas_salida = 0) then
    raise exception 'El cambio debe registrar entrada y salida en la misma operacion.';
  end if;

  if p_tipo = 'inventario_inicial' then
    if (select count(*) from jsonb_array_elements(p_detalles))
       <> (select count(distinct value ->> 'producto_id') from jsonb_array_elements(p_detalles)) then
      raise exception 'Cada producto debe aparecer una sola vez en el inventario inicial.';
    end if;

    insert into public.existencias (producto_id, ubicacion_id, cantidad)
    select (linea ->> 'producto_id')::bigint,
           (linea ->> 'ubicacion_destino_id')::bigint,
           0
    from jsonb_array_elements(p_detalles) as detalle(linea)
    on conflict (producto_id, ubicacion_id) do nothing;

    perform 1
    from public.existencias e
    join (
      select (linea ->> 'producto_id')::bigint as producto_id,
             (linea ->> 'ubicacion_destino_id')::bigint as ubicacion_id
      from jsonb_array_elements(p_detalles) as detalle(linea)
    ) as iniciales using (producto_id, ubicacion_id)
    order by e.producto_id, e.ubicacion_id
    for update of e;

    if exists (
      select 1
      from jsonb_array_elements(p_detalles) as detalle(linea)
      join public.existencias e
        on e.producto_id = (linea ->> 'producto_id')::bigint
       and e.ubicacion_id = (linea ->> 'ubicacion_destino_id')::bigint
      where e.cantidad > 0
    ) or exists (
      select 1
      from jsonb_array_elements(p_detalles) as detalle(linea)
      join public.detalle_documento dd
        on dd.producto_id = (linea ->> 'producto_id')::bigint
       and dd.ubicacion_destino_id = (linea ->> 'ubicacion_destino_id')::bigint
      join public.documentos d on d.id = dd.documento_id
      where d.tipo = 'inventario_inicial' and d.estado in ('pendiente', 'aprobado')
    ) then
      raise exception 'El inventario inicial ya fue registrado para uno de los productos.';
    end if;
  end if;

  v_serie := case p_tipo
    when 'entrada_compra' then 'ENC'
    when 'entrada_devolucion_cliente' then 'ECL'
    when 'entrada_cambio' then 'ECA'
    when 'inventario_inicial' then 'INI'
    when 'salida_venta' then 'VTA'
    when 'despacho_minibodega' then 'DES'
    when 'traslado' then 'TRA'
    when 'merma' then 'MER'
    when 'consumo_interno' then 'CIN'
    when 'devolucion_proveedor' then 'DPV'
    when 'salida_cambio' then 'SCA'
    when 'ajuste_positivo' then 'AJP'
    when 'ajuste_negativo' then 'AJN'
  end;

  insert into public.correlativos (serie, anio, ultimo_numero)
  values (v_serie, v_anio, 1)
  on conflict (serie, anio) do update
    set ultimo_numero = public.correlativos.ultimo_numero + 1
  returning ultimo_numero into v_correlativo;

  insert into public.documentos (
    tipo, serie, anio, correlativo, doc_venta_tipo, doc_venta_numero,
    doc_proveedor_numero, orden_pedido_id, documento_origen_id, estado,
    motivo, creado_por, retira_nombre, placa, evidencia_url, es_contingencia
  ) values (
    p_tipo, v_serie, v_anio, v_correlativo, v_venta_tipo, v_venta_numero,
    v_proveedor_numero, v_orden_id, v_origen_id, 'pendiente',
    v_motivo, v_usuario, v_retira, v_placa, v_evidencia, v_contingencia
  ) returning id into v_documento_id;

  insert into public.detalle_documento (
    documento_id, producto_id, ubicacion_origen_id, ubicacion_destino_id, cantidad,
    observacion, detalle_orden_pedido_id
  )
  select v_documento_id,
         (linea ->> 'producto_id')::bigint,
         nullif(linea ->> 'ubicacion_origen_id', '')::bigint,
         nullif(linea ->> 'ubicacion_destino_id', '')::bigint,
         (linea ->> 'cantidad')::integer,
         nullif(btrim(linea ->> 'observacion'), ''),
         nullif(linea ->> 'detalle_orden_pedido_id', '')::bigint
  from jsonb_array_elements(p_detalles) as detalle(linea);

  -- Un cambio/garantía que no cuadra en unidades netas equivale a un ajuste de stock:
  -- queda pendiente y solo un administrador activo puede aprobarlo (misma regla que merma y ajustes).
  v_pendiente := p_tipo in ('merma', 'ajuste_positivo', 'ajuste_negativo')
    or (
      p_tipo in ('entrada_cambio', 'salida_cambio')
      and (
        select coalesce(sum(dd.cantidad) filter (where dd.ubicacion_destino_id is not null), 0)
            <> coalesce(sum(dd.cantidad) filter (where dd.ubicacion_origen_id is not null), 0)
        from public.detalle_documento dd
        where dd.documento_id = v_documento_id
      )
    );
  if not v_pendiente then
    perform private.aplicar_movimiento(v_documento_id);
    update public.documentos d
    set estado = 'aprobado', aprobado_por = v_usuario, aprobado_en = now()
    where d.id = v_documento_id;
  end if;

  return v_documento_id;
end;
$$;
