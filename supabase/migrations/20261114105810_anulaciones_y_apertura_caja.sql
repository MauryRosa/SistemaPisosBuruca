-- Anulaciones con movimiento inverso y apertura trazable de cajas.
alter table public.detalle_documento
  add column cantidad_cajas_abiertas integer not null default 0
  check (cantidad_cajas_abiertas >= 0);

create or replace function private.anular_movimiento_core(p_documento_id bigint, p_motivo text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_original public.documentos%rowtype;
  v_numero_anulacion bigint;
  v_serie text := 'ANU';
  v_anio integer := extract(year from now() at time zone 'America/El_Salvador')::integer;
  v_correlativo integer;
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo un administrador activo puede anular movimientos.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indique el motivo de la anulacion.';
  end if;

  select d.* into v_original
  from public.documentos d
  where d.id = p_documento_id
  for update;
  if not found or v_original.estado <> 'aprobado'
     or v_original.tipo in ('anulacion', 'apertura_caja') then
    raise exception 'Solo se puede anular un movimiento aprobado y reversible.';
  end if;
  if v_original.tipo = 'traslado' and v_original.traslado_confirmado_en is null then
    raise exception 'Confirme o cancele el traslado pendiente antes de anularlo.';
  end if;

  if v_original.tipo = 'entrada_compra' and exists (
    select 1 from public.documentos d
    where d.tipo = 'devolucion_proveedor'
      and d.documento_origen_id = v_original.id
      and d.estado in ('pendiente', 'aprobado')
  ) then
    raise exception 'Anule las devoluciones al proveedor vinculadas antes de anular la recepcion.';
  end if;

  perform 1
  from public.productos p
  join public.detalle_documento dd on dd.producto_id = p.id
  where dd.documento_id = v_original.id
  order by p.id
  for share of p;
  if exists (
    select 1
    from public.productos p
    join public.detalle_documento dd on dd.producto_id = p.id
    where dd.documento_id = v_original.id and not p.activo
  ) then
    raise exception 'Reactive los productos del movimiento antes de anularlo.';
  end if;

  perform 1 from public.correlativos c where c.serie = v_serie and c.anio = v_anio for update;
  insert into public.correlativos (serie, anio, ultimo_numero)
  values (v_serie, v_anio, 1)
  on conflict (serie, anio) do update
    set ultimo_numero = public.correlativos.ultimo_numero + 1
  returning ultimo_numero into v_correlativo;

  insert into public.documentos (
    tipo, serie, anio, correlativo, documento_origen_id, estado, motivo, creado_por
  ) values (
    'anulacion', v_serie, v_anio, v_correlativo, v_original.id, 'pendiente',
    'Anulacion de ' || v_original.serie || '-' || v_original.anio || '-' || lpad(v_original.correlativo::text, 5, '0') || ': ' || btrim(p_motivo),
    v_usuario
  ) returning id into v_numero_anulacion;

  insert into public.detalle_documento (
    documento_id, producto_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, observacion
  )
  select v_numero_anulacion,
         dd.producto_id,
         dd.ubicacion_destino_id,
         dd.ubicacion_origen_id,
         dd.cantidad,
         'Reversion del documento ' || v_original.serie || '-' || v_original.anio || '-' || lpad(v_original.correlativo::text, 5, '0')
  from public.detalle_documento dd
  where dd.documento_id = v_original.id;
  if not found then
    raise exception 'El movimiento no contiene líneas para revertir.';
  end if;

  perform private.aplicar_movimiento(v_numero_anulacion);

  if v_original.tipo = 'entrada_compra' then
    perform 1 from public.ordenes_pedido op
    where op.id = v_original.orden_pedido_id
    for update;
    if not found then
      raise exception 'La orden de compra vinculada a la recepcion ya no existe.';
    end if;

    perform 1
    from public.detalle_orden_pedido dop
    join (
      select dd.detalle_orden_pedido_id as id, sum(dd.cantidad)::integer as cantidad
      from public.detalle_documento dd
      where dd.documento_id = v_original.id
        and dd.detalle_orden_pedido_id is not null
      group by dd.detalle_orden_pedido_id
    ) recibidas on recibidas.id = dop.id
    order by dop.id
    for update of dop;

    if exists (
      select 1
      from public.detalle_orden_pedido dop
      join (
        select dd.detalle_orden_pedido_id as id, sum(dd.cantidad)::integer as cantidad
        from public.detalle_documento dd
        where dd.documento_id = v_original.id
          and dd.detalle_orden_pedido_id is not null
        group by dd.detalle_orden_pedido_id
      ) recibidas on recibidas.id = dop.id
      where dop.cantidad_recibida < recibidas.cantidad
    ) then
      raise exception 'El acumulado recibido de la orden ya no coincide con la recepcion.';
    end if;

    update public.detalle_orden_pedido dop
    set cantidad_recibida = dop.cantidad_recibida - recibidas.cantidad
    from (
      select dd.detalle_orden_pedido_id as id, sum(dd.cantidad)::integer as cantidad
      from public.detalle_documento dd
      where dd.documento_id = v_original.id
        and dd.detalle_orden_pedido_id is not null
      group by dd.detalle_orden_pedido_id
    ) recibidas
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
    where op.id = v_original.orden_pedido_id;
  end if;

  update public.documentos d
  set estado = 'aprobado', aprobado_por = v_usuario, aprobado_en = now()
  where d.id = v_numero_anulacion;

  update public.documentos d
  set estado = 'anulado',
      motivo = left(concat_ws(' | ', nullif(d.motivo, ''), 'Anulado: ' || btrim(p_motivo)), 1000)
  where d.id = v_original.id and d.estado = 'aprobado';

  return v_numero_anulacion;
end;
$$;

create or replace function private.registrar_apertura_caja_core(
  p_ubicacion_id bigint,
  p_detalles jsonb,
  p_es_contingencia boolean
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_rol public.rol_usuario;
  v_documento_id bigint;
  v_serie text := 'APE';
  v_anio integer := extract(year from now() at time zone 'America/El_Salvador')::integer;
  v_correlativo integer;
  v_linea jsonb;
  v_producto_id bigint;
  v_cajas integer;
  v_piezas_por_caja integer;
  v_fisico integer;
  v_reservado integer;
begin
  select u.rol into v_rol
  from public.usuarios u
  where u.id = v_usuario and u.activo;
  if v_usuario is null or v_rol is null or v_rol not in ('administrador', 'jefe_bodega') then
    raise exception 'Solo bodega o administracion puede registrar aperturas de caja.';
  end if;
  if jsonb_typeof(p_detalles) is distinct from 'array'
     or jsonb_array_length(case when jsonb_typeof(p_detalles) = 'array' then p_detalles else '[]'::jsonb end) = 0 then
    raise exception 'Indique las cajas que se abriran.';
  end if;
  if (select count(distinct (value ->> 'producto_id')::bigint) from jsonb_array_elements(p_detalles))
     <> jsonb_array_length(p_detalles) then
    raise exception 'Cada producto debe aparecer una sola vez.';
  end if;

  perform 1 from public.ubicaciones u
  where u.id = p_ubicacion_id and u.activa and u.tipo = 'bodega'
  for share;
  if not found then
    raise exception 'La apertura de cajas solo se registra en una bodega principal activa.';
  end if;

  for v_linea in
    select value from jsonb_array_elements(p_detalles)
    order by (value ->> 'producto_id')::bigint
  loop
    v_producto_id := nullif(v_linea ->> 'producto_id', '')::bigint;
    v_cajas := nullif(v_linea ->> 'cantidad_cajas', '')::integer;
    select p.piezas_por_caja into v_piezas_por_caja
    from public.productos p
    where p.id = v_producto_id and p.activo and p.tipo = 'piso'
    for share;
    if v_piezas_por_caja is null or v_cajas is null or v_cajas <= 0 then
      raise exception 'Seleccione un piso activo y una cantidad positiva de cajas.';
    end if;

    perform 1 from public.existencias e
    where e.producto_id = v_producto_id and e.ubicacion_id = p_ubicacion_id
    for update;
    select coalesce(e.cantidad, 0) into v_fisico
    from public.existencias e
    where e.producto_id = v_producto_id and e.ubicacion_id = p_ubicacion_id;
    if not found then v_fisico := 0; end if;
    select coalesce(sum(r.cantidad), 0)::integer into v_reservado
    from public.reservas r
    where r.producto_id = v_producto_id and r.ubicacion_id = p_ubicacion_id and r.estado = 'activa';
    if v_fisico - v_reservado < v_cajas * v_piezas_por_caja then
      raise exception 'No hay cajas completas disponibles para abrir del producto %.', v_producto_id;
    end if;
  end loop;

  insert into public.correlativos (serie, anio, ultimo_numero)
  values (v_serie, v_anio, 1)
  on conflict (serie, anio) do update
    set ultimo_numero = public.correlativos.ultimo_numero + 1
  returning ultimo_numero into v_correlativo;

  insert into public.documentos (
    tipo, serie, anio, correlativo, estado, motivo, creado_por, aprobado_por, aprobado_en, es_contingencia
  ) values (
    'apertura_caja', v_serie, v_anio, v_correlativo, 'pendiente', 'Apertura de cajas', v_usuario, v_usuario, now(), coalesce(p_es_contingencia, false)
  ) returning id into v_documento_id;

  insert into public.detalle_documento (
    documento_id, producto_id, ubicacion_origen_id, cantidad, cantidad_cajas_abiertas, observacion
  )
  select v_documento_id,
         p.id,
         p_ubicacion_id,
         (linea ->> 'cantidad_cajas')::integer * p.piezas_por_caja,
         (linea ->> 'cantidad_cajas')::integer,
         'Apertura de ' || (linea ->> 'cantidad_cajas') || ' cajas'
  from jsonb_array_elements(p_detalles) as detalle(linea)
  join public.productos p on p.id = (linea ->> 'producto_id')::bigint;

  update public.documentos d set estado = 'aprobado' where d.id = v_documento_id;
  return v_documento_id;
end;
$$;

create or replace function public.anular_movimiento(p_documento_id bigint, p_motivo text)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.anular_movimiento_core(p_documento_id, p_motivo);
$$;

create or replace function public.registrar_apertura_caja(
  p_ubicacion_id bigint,
  p_detalles jsonb,
  p_es_contingencia boolean
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.registrar_apertura_caja_core(p_ubicacion_id, p_detalles, p_es_contingencia);
$$;

revoke all on function private.anular_movimiento_core(bigint, text) from public, anon;
revoke all on function private.registrar_apertura_caja_core(bigint, jsonb, boolean) from public, anon;
grant execute on function private.anular_movimiento_core(bigint, text) to authenticated;
grant execute on function private.registrar_apertura_caja_core(bigint, jsonb, boolean) to authenticated;

revoke all on function public.anular_movimiento(bigint, text) from public, anon;
revoke all on function public.registrar_apertura_caja(bigint, jsonb, boolean) from public, anon;
grant execute on function public.anular_movimiento(bigint, text) to authenticated;
grant execute on function public.registrar_apertura_caja(bigint, jsonb, boolean) to authenticated;
