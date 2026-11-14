-- Los movimientos se registran y aplican dentro de una transaccion. Las
-- escrituras de existencias, correlativos, documentos y sus lineas no se
-- exponen directamente a clientes autenticados.

alter table public.detalle_documento
  add column detalle_orden_pedido_id bigint
  references public.detalle_orden_pedido (id);

alter table public.documentos
  add column traslado_confirmado_en timestamptz,
  add column traslado_confirmado_por uuid references public.usuarios (id),
  add constraint documentos_confirmacion_traslado_pareja check (
    (traslado_confirmado_en is null and traslado_confirmado_por is null)
    or (traslado_confirmado_en is not null and traslado_confirmado_por is not null)
  ),
  add constraint documentos_confirmacion_solo_traslado check (
    tipo = 'traslado'
    or (traslado_confirmado_en is null and traslado_confirmado_por is null)
  );

create or replace function private.proteger_destino_traslado_en_transito()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo administracion puede cambiar una ubicacion.';
  end if;

  if ((old.activa and not new.activa)
      or (new.tipo, new.vendible) is distinct from (old.tipo, old.vendible))
     and exists (
       select 1
       from public.detalle_documento dd
       join public.documentos d on d.id = dd.documento_id
       where old.id in (dd.ubicacion_origen_id, dd.ubicacion_destino_id)
         and d.tipo = 'traslado'
         and d.estado = 'aprobado'
         and d.traslado_confirmado_en is null
     ) then
    raise exception 'La ubicacion participa en un traslado que aun no se ha recibido.';
  end if;

  return new;
end;
$$;

revoke all on function private.proteger_destino_traslado_en_transito() from public, anon, authenticated;

create trigger ubicaciones_proteger_traslados_en_transito
  before update of activa, tipo, vendible on public.ubicaciones
  for each row execute function private.proteger_destino_traslado_en_transito();

create or replace function private.aplicar_movimiento(p_documento_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento public.documentos%rowtype;
  v_salida record;
  v_usuario uuid := (select auth.uid());
  v_fisico integer;
  v_reservado integer;
  v_reservado_documento integer;
  v_pedido_id bigint;
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo
      and u.rol in ('administrador', 'jefe_bodega')
  ) then
    raise exception 'Se requiere un usuario de bodega o administracion activo.';
  end if;

  select d.* into v_documento
  from public.documentos d
  where d.id = p_documento_id
  for update;

  if not found or v_documento.estado <> 'pendiente' then
    raise exception 'El movimiento no existe o ya fue procesado.';
  end if;

  if not exists (
    select 1 from public.detalle_documento dd
    where dd.documento_id = p_documento_id
  ) then
    raise exception 'El movimiento debe tener al menos una linea.';
  end if;

  if exists (
    select 1
    from public.detalle_documento dd
    cross join lateral (values (dd.ubicacion_origen_id), (dd.ubicacion_destino_id)) as punto(id)
    join public.ubicaciones u on u.id = punto.id
    where dd.documento_id = p_documento_id and not u.activa
  ) then
    raise exception 'El movimiento referencia una ubicacion inactiva.';
  end if;

  perform 1
  from public.ubicaciones u
  where exists (
    select 1
    from public.detalle_documento dd
    cross join lateral (values (dd.ubicacion_origen_id), (dd.ubicacion_destino_id)) as punto(id)
    where dd.documento_id = p_documento_id and punto.id = u.id
  )
  order by u.id
  for share;

  -- Crea saldos en cero para ubicaciones nuevas y los bloquea en un orden
  -- estable para evitar carreras y reducir interbloqueos entre movimientos.
  insert into public.existencias (producto_id, ubicacion_id, cantidad)
  select distinct dd.producto_id, ubicacion.id, 0
  from public.detalle_documento dd
  cross join lateral (values
    (dd.ubicacion_origen_id),
    (dd.ubicacion_destino_id)
  ) as ubicacion(id)
  where dd.documento_id = p_documento_id
    and ubicacion.id is not null
  on conflict (producto_id, ubicacion_id) do nothing;

  perform 1
  from public.existencias e
  where exists (
    select 1
    from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.producto_id = e.producto_id
      and e.ubicacion_id in (dd.ubicacion_origen_id, dd.ubicacion_destino_id)
  )
  order by e.producto_id, e.ubicacion_id
  for update;

  -- Ningun egreso puede consumir existencias apartadas. Una venta puede
  -- consumir su propia reserva, siempre que la salida cubra la reserva completa.
  for v_salida in
    select dd.producto_id,
           dd.ubicacion_origen_id as ubicacion_id,
           sum(dd.cantidad)::integer as cantidad
    from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.ubicacion_origen_id is not null
    group by dd.producto_id, dd.ubicacion_origen_id
    order by dd.producto_id, dd.ubicacion_origen_id
  loop
    select e.cantidad into v_fisico
    from public.existencias e
    where e.producto_id = v_salida.producto_id
      and e.ubicacion_id = v_salida.ubicacion_id;

    select coalesce(sum(r.cantidad), 0)::integer into v_reservado
    from public.reservas r
    where r.producto_id = v_salida.producto_id
      and r.ubicacion_id = v_salida.ubicacion_id
      and r.estado = 'activa';

    v_reservado_documento := 0;
    if v_documento.tipo in ('salida_venta', 'despacho_minibodega') then
      select coalesce(sum(r.cantidad), 0)::integer into v_reservado_documento
      from public.reservas r
      where r.producto_id = v_salida.producto_id
        and r.ubicacion_id = v_salida.ubicacion_id
        and r.estado = 'activa'
        and r.doc_venta_tipo = v_documento.doc_venta_tipo
        and r.doc_venta_numero = v_documento.doc_venta_numero;

      if v_reservado_documento > v_salida.cantidad then
        raise exception 'La salida debe cubrir completa la reserva activa del producto %.', v_salida.producto_id;
      end if;
    end if;

    if v_fisico - v_reservado + v_reservado_documento < v_salida.cantidad then
      raise exception 'Existencia disponible insuficiente para el producto % en la ubicacion %.',
        v_salida.producto_id, v_salida.ubicacion_id;
    end if;
  end loop;

  update public.existencias e
  set cantidad = e.cantidad - salidas.cantidad,
      actualizado_en = now()
  from (
    select dd.producto_id,
           dd.ubicacion_origen_id as ubicacion_id,
           sum(dd.cantidad)::integer as cantidad
    from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.ubicacion_origen_id is not null
    group by dd.producto_id, dd.ubicacion_origen_id
  ) as salidas
  where e.producto_id = salidas.producto_id
    and e.ubicacion_id = salidas.ubicacion_id;

  update public.existencias e
  set cantidad = e.cantidad + entradas.cantidad,
      actualizado_en = now()
  from (
    select dd.producto_id,
           dd.ubicacion_destino_id as ubicacion_id,
           sum(dd.cantidad)::integer as cantidad
    from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.ubicacion_destino_id is not null
    group by dd.producto_id, dd.ubicacion_destino_id
  ) as entradas
  where e.producto_id = entradas.producto_id
    and e.ubicacion_id = entradas.ubicacion_id
    and not (v_documento.tipo = 'traslado' and v_documento.traslado_confirmado_en is null);

  if v_documento.tipo = 'entrada_compra' then
    select d.orden_pedido_id into v_pedido_id
    from public.documentos d
    where d.id = p_documento_id;

    perform 1
    from public.ordenes_pedido op
    where op.id = v_pedido_id
    for update;

    update public.detalle_orden_pedido dop
    set cantidad_recibida = dop.cantidad_recibida + recibidas.cantidad
    from (
      select dd.detalle_orden_pedido_id as id, sum(dd.cantidad)::integer as cantidad
      from public.detalle_documento dd
      where dd.documento_id = p_documento_id
        and dd.detalle_orden_pedido_id is not null
      group by dd.detalle_orden_pedido_id
    ) as recibidas
    where dop.id = recibidas.id;

    update public.ordenes_pedido op
    set estado = case
      when not exists (
        select 1 from public.detalle_orden_pedido dop
        where dop.orden_pedido_id = op.id and dop.cantidad_recibida < dop.cantidad
      ) then 'cerrada'::public.estado_pedido
      when exists (
        select 1 from public.detalle_orden_pedido dop
        where dop.orden_pedido_id = op.id and dop.cantidad_recibida > 0
      ) then 'parcial'::public.estado_pedido
      else 'abierta'::public.estado_pedido
    end
    where op.id = v_pedido_id;
  end if;

  if v_documento.tipo in ('salida_venta', 'despacho_minibodega') then
    if exists (
      select 1
      from public.reservas r
      where r.estado = 'activa'
        and r.doc_venta_tipo = v_documento.doc_venta_tipo
        and r.doc_venta_numero = v_documento.doc_venta_numero
        and coalesce((
          select sum(dd.cantidad)::integer
          from public.detalle_documento dd
          where dd.documento_id = p_documento_id
            and dd.producto_id = r.producto_id
            and dd.ubicacion_origen_id = r.ubicacion_id
        ), 0) < r.cantidad
    ) then
      raise exception 'La salida debe incluir y cubrir todos los productos reservados para el documento de venta.';
    end if;

    update public.reservas r
    set estado = 'consumida', documento_id = p_documento_id
    where r.estado = 'activa'
      and r.doc_venta_tipo = v_documento.doc_venta_tipo
      and r.doc_venta_numero = v_documento.doc_venta_numero
      and exists (
        select 1
        from public.detalle_documento dd
        where dd.documento_id = p_documento_id
          and dd.producto_id = r.producto_id
          and dd.ubicacion_origen_id = r.ubicacion_id
      );
  end if;
end;
$$;

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
  for v_linea in select value from jsonb_array_elements(p_detalles)
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
    where p.id = v_producto_id and p.activo;
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

  v_pendiente := p_tipo in ('merma', 'ajuste_positivo', 'ajuste_negativo');
  if not v_pendiente then
    perform private.aplicar_movimiento(v_documento_id);
    update public.documentos d
    set estado = 'aprobado', aprobado_por = v_usuario, aprobado_en = now()
    where d.id = v_documento_id;
  end if;

  return v_documento_id;
end;
$$;

create or replace function private.aprobar_movimiento_core(p_documento_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo un administrador activo puede aprobar movimientos.';
  end if;

  perform private.aplicar_movimiento(p_documento_id);

  update public.documentos d
  set estado = 'aprobado', aprobado_por = v_usuario, aprobado_en = now()
  where d.id = p_documento_id and d.estado = 'pendiente';

  if not found then
    raise exception 'El movimiento no esta pendiente.';
  end if;
end;
$$;

create or replace function private.rechazar_movimiento_core(p_documento_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo un administrador activo puede rechazar movimientos.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indique el motivo del rechazo.';
  end if;

  update public.documentos d
  set estado = 'rechazado',
      aprobado_por = v_usuario,
      aprobado_en = now(),
      motivo = left(concat_ws(' | ', nullif(d.motivo, ''), 'Rechazado: ' || btrim(p_motivo)), 1000)
  where d.id = p_documento_id and d.estado = 'pendiente';

  if not found then
    raise exception 'El movimiento no existe o ya fue procesado.';
  end if;
end;
$$;

create or replace function private.confirmar_traslado_core(p_documento_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_documento public.documentos%rowtype;
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo
      and u.rol in ('administrador', 'jefe_bodega')
  ) then
    raise exception 'Solo bodega o administracion puede confirmar traslados.';
  end if;

  select d.* into v_documento
  from public.documentos d
  where d.id = p_documento_id
  for update;

  if not found or v_documento.tipo <> 'traslado' or v_documento.estado <> 'aprobado'
     or v_documento.traslado_confirmado_en is not null then
    raise exception 'El traslado no existe o ya fue confirmado.';
  end if;

  if not exists (
    select 1 from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.ubicacion_origen_id is not null
      and dd.ubicacion_destino_id is not null
  ) then
    raise exception 'El traslado no tiene lineas completas.';
  end if;

  if exists (
    select 1
    from public.detalle_documento dd
    join public.ubicaciones u on u.id = dd.ubicacion_destino_id
    where dd.documento_id = p_documento_id and not u.activa
  ) then
    raise exception 'El destino del traslado esta inactivo.';
  end if;

  perform 1
  from public.ubicaciones u
  where exists (
    select 1 from public.detalle_documento dd
    where dd.documento_id = p_documento_id and dd.ubicacion_destino_id = u.id
  )
  order by u.id
  for share;

  insert into public.existencias (producto_id, ubicacion_id, cantidad)
  select distinct dd.producto_id, dd.ubicacion_destino_id, 0
  from public.detalle_documento dd
  where dd.documento_id = p_documento_id
  on conflict (producto_id, ubicacion_id) do nothing;

  perform 1
  from public.existencias e
  where exists (
    select 1 from public.detalle_documento dd
    where dd.documento_id = p_documento_id
      and dd.producto_id = e.producto_id
      and dd.ubicacion_destino_id = e.ubicacion_id
  )
  order by e.producto_id, e.ubicacion_id
  for update;

  update public.existencias e
  set cantidad = e.cantidad + entradas.cantidad,
      actualizado_en = now()
  from (
    select dd.producto_id,
           dd.ubicacion_destino_id as ubicacion_id,
           sum(dd.cantidad)::integer as cantidad
    from public.detalle_documento dd
    where dd.documento_id = p_documento_id
    group by dd.producto_id, dd.ubicacion_destino_id
  ) as entradas
  where e.producto_id = entradas.producto_id
    and e.ubicacion_id = entradas.ubicacion_id;

  update public.documentos d
  set traslado_confirmado_en = now(), traslado_confirmado_por = v_usuario
  where d.id = p_documento_id and d.traslado_confirmado_en is null;
end;
$$;

-- Las reservas compiten por el mismo saldo que las salidas. Bloquear la fila
-- de existencias durante la validacion hace que reservas y despachos se
-- serialicen para cada producto y ubicacion.
create or replace function private.validar_reserva_disponible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fisico integer;
  v_reservado integer;
  v_reserva_anterior bigint;
begin
  if (select auth.uid()) is not null and not exists (
    select 1 from public.usuarios u
    where u.id = (select auth.uid()) and u.activo
      and u.rol in ('administrador', 'jefe_bodega')
  ) then
    raise exception 'El usuario no puede modificar reservas.';
  end if;

  if tg_op = 'UPDATE' then
    if old.estado <> 'activa' then
      raise exception 'Una reserva procesada no se puede volver a modificar.';
    end if;

    if (new.producto_id, new.ubicacion_id, new.cantidad, new.vendedora_id,
        new.doc_venta_tipo, new.doc_venta_numero, new.creado_por, new.creado_en)
       is distinct from
       (old.producto_id, old.ubicacion_id, old.cantidad, old.vendedora_id,
        old.doc_venta_tipo, old.doc_venta_numero, old.creado_por, old.creado_en) then
      raise exception 'Una reserva conserva su producto, ubicacion, cantidad y solicitante.';
    end if;
    v_reserva_anterior := old.id;
  end if;

  if (new.doc_venta_tipo is null) <> (new.doc_venta_numero is null) then
    raise exception 'El tipo y numero de venta deben indicarse juntos.';
  end if;

  if new.estado = 'activa' and new.documento_id is not null then
    raise exception 'Una reserva activa no puede estar ligada a una salida.';
  elsif new.estado = 'consumida' and new.documento_id is null then
    raise exception 'Una reserva consumida debe estar ligada a su salida.';
  elsif new.estado = 'cancelada' and nullif(btrim(new.motivo_cancelacion), '') is null then
    raise exception 'Cancelar una reserva requiere un motivo.';
  end if;

  if tg_op = 'INSERT' and not exists (
    select 1 from public.usuarios u
    where u.id = new.vendedora_id and u.activo and u.rol = 'vendedora'
  ) then
    raise exception 'Seleccione una vendedora activa.';
  end if;

  if not exists (
    select 1 from public.ubicaciones u
    where u.id = new.ubicacion_id and u.activa and u.vendible
  ) then
    raise exception 'La reserva requiere una ubicacion vendible activa.';
  end if;

  if new.estado <> 'activa' then
    return new;
  end if;

  perform 1
  from public.existencias e
  where e.producto_id = new.producto_id
    and e.ubicacion_id = new.ubicacion_id
  for update;

  select coalesce(e.cantidad, 0) into v_fisico
  from public.existencias e
  where e.producto_id = new.producto_id
    and e.ubicacion_id = new.ubicacion_id;
  if not found then
    v_fisico := 0;
  end if;

  select coalesce(sum(r.cantidad), 0)::integer into v_reservado
  from public.reservas r
  where r.producto_id = new.producto_id
    and r.ubicacion_id = new.ubicacion_id
    and r.estado = 'activa'
    and (v_reserva_anterior is null or r.id <> v_reserva_anterior);

  if v_fisico - v_reservado < new.cantidad then
    raise exception 'No hay saldo disponible para reservar el producto % en la ubicacion %.',
      new.producto_id, new.ubicacion_id;
  end if;

  return new;
end;
$$;

create or replace function private.cancelar_reserva_core(p_reserva_id bigint, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo
      and u.rol in ('administrador', 'jefe_bodega')
  ) then
    raise exception 'Solo bodega o administracion puede cancelar reservas.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indique el motivo de cancelacion.';
  end if;

  update public.reservas r
  set estado = 'cancelada', motivo_cancelacion = btrim(p_motivo)
  where r.id = p_reserva_id and r.estado = 'activa';

  if not found then
    raise exception 'La reserva no existe o ya fue procesada.';
  end if;
end;
$$;

-- El historial y los saldos se consultan por SELECT; sus mutaciones pasan
-- exclusivamente por las funciones RPC de abajo.
revoke insert, update, delete, truncate, references, trigger
on table public.documentos, public.detalle_documento, public.existencias, public.correlativos
from public, anon, authenticated;

revoke update on table public.reservas from public, anon, authenticated;

drop index if exists public.documentos_doc_venta_unico_idx;
create unique index documentos_doc_venta_unico_idx
  on public.documentos (doc_venta_tipo, doc_venta_numero)
  where tipo in ('salida_venta', 'despacho_minibodega')
    and estado in ('pendiente', 'aprobado');

drop policy if exists documentos_aprobar on public.documentos;
drop policy if exists reservas_editar on public.reservas;

create trigger reservas_validar_disponible
  before insert or update on public.reservas
  for each row execute function private.validar_reserva_disponible();

create or replace function public.registrar_movimiento(
  p_tipo public.tipo_documento,
  p_cabecera jsonb,
  p_detalles jsonb
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.registrar_movimiento_core(p_tipo, p_cabecera, p_detalles);
$$;

create or replace function public.aprobar_movimiento(p_documento_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.aprobar_movimiento_core(p_documento_id);
$$;

create or replace function public.rechazar_movimiento(p_documento_id bigint, p_motivo text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.rechazar_movimiento_core(p_documento_id, p_motivo);
$$;

create or replace function public.cancelar_reserva(p_reserva_id bigint, p_motivo text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cancelar_reserva_core(p_reserva_id, p_motivo);
$$;

create or replace function public.confirmar_traslado(p_documento_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.confirmar_traslado_core(p_documento_id);
$$;

revoke all on function private.aplicar_movimiento(bigint) from public, anon, authenticated;
revoke all on function private.registrar_movimiento_core(public.tipo_documento, jsonb, jsonb) from public, anon;
revoke all on function private.aprobar_movimiento_core(bigint) from public, anon;
revoke all on function private.rechazar_movimiento_core(bigint, text) from public, anon;
revoke all on function private.validar_reserva_disponible() from public, anon, authenticated;
revoke all on function private.cancelar_reserva_core(bigint, text) from public, anon;
revoke all on function private.confirmar_traslado_core(bigint) from public, anon;
grant execute on function private.registrar_movimiento_core(public.tipo_documento, jsonb, jsonb) to authenticated;
grant execute on function private.aprobar_movimiento_core(bigint) to authenticated;
grant execute on function private.rechazar_movimiento_core(bigint, text) to authenticated;
grant execute on function private.cancelar_reserva_core(bigint, text) to authenticated;
grant execute on function private.confirmar_traslado_core(bigint) to authenticated;

revoke all on function public.registrar_movimiento(public.tipo_documento, jsonb, jsonb) from public, anon;
revoke all on function public.aprobar_movimiento(bigint) from public, anon;
revoke all on function public.rechazar_movimiento(bigint, text) from public, anon;
revoke all on function public.cancelar_reserva(bigint, text) from public, anon;
revoke all on function public.confirmar_traslado(bigint) from public, anon;
grant execute on function public.registrar_movimiento(public.tipo_documento, jsonb, jsonb) to authenticated;
grant execute on function public.aprobar_movimiento(bigint) to authenticated;
grant execute on function public.rechazar_movimiento(bigint, text) to authenticated;
grant execute on function public.cancelar_reserva(bigint, text) to authenticated;
grant execute on function public.confirmar_traslado(bigint) to authenticated;

-- Evidencias privadas de entrega y cartas de merma.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias-movimientos',
  'evidencias-movimientos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy evidencias_movimientos_leer on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidencias-movimientos'
    and (select private.rol_actual()) in ('administrador', 'jefe_bodega')
  );

create policy evidencias_movimientos_subir on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidencias-movimientos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.rol_actual()) in ('administrador', 'jefe_bodega')
  );

-- Solo permite limpiar una carga huérfana del mismo usuario; la evidencia ligada
-- a un documento se conserva junto con su bitácora.
create policy evidencias_movimientos_limpiar_huerfana on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'evidencias-movimientos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.documentos d where d.evidencia_url = storage.objects.name
    )
  );

create trigger bitacora_detalle_documento
  after insert or update or delete on public.detalle_documento
  for each row execute function private.registrar_bitacora();

create trigger bitacora_existencias
  after insert or update or delete on public.existencias
  for each row execute function private.registrar_bitacora();
