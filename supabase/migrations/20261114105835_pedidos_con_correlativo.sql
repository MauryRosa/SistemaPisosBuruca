alter table public.ordenes_pedido
  add column motivo_cierre text;

create or replace function private.crear_orden_pedido_core(
  p_proveedor_id bigint,
  p_fecha_estimada date,
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
  v_anio integer := extract(year from now() at time zone 'America/El_Salvador')::integer;
  v_correlativo integer;
  v_orden_id bigint;
  v_numero text;
  v_linea jsonb;
  v_producto_id bigint;
  v_cantidad integer;
begin
  if v_usuario is null then
    raise exception 'Se requiere una sesion autenticada.';
  end if;

  select u.rol into v_rol
  from public.usuarios u
  where u.id = v_usuario and u.activo;

  if v_rol is null or v_rol not in ('administrador', 'vendedora') then
    raise exception 'Solo administracion o ventas puede crear pedidos.';
  end if;

  if not exists (
    select 1 from public.proveedores p
    where p.id = p_proveedor_id and p.activo
  ) then
    raise exception 'Seleccione un proveedor activo.';
  end if;

  if jsonb_typeof(p_detalles) is distinct from 'array'
     or jsonb_array_length(case when jsonb_typeof(p_detalles) = 'array' then p_detalles else '[]'::jsonb end) = 0 then
    raise exception 'El pedido debe incluir al menos un producto.';
  end if;

  if (select count(*) from jsonb_array_elements(p_detalles))
     <> (select count(distinct nullif(value ->> 'producto_id', '')::bigint) from jsonb_array_elements(p_detalles)) then
    raise exception 'Agregue cada producto una sola vez al pedido.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_detalles)
  loop
    v_producto_id := nullif(v_linea ->> 'producto_id', '')::bigint;
    v_cantidad := nullif(v_linea ->> 'cantidad', '')::integer;

    if v_producto_id is null or v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada linea requiere producto y cantidad positiva.';
    end if;

    if not exists (
      select 1 from public.productos p
      where p.id = v_producto_id and p.activo
        and (p.proveedor_id is null or p.proveedor_id = p_proveedor_id)
    ) then
      raise exception 'El producto % no esta activo o no pertenece al proveedor.', v_producto_id;
    end if;
  end loop;

  insert into public.correlativos (serie, anio, ultimo_numero)
  values ('OP', v_anio, 1)
  on conflict (serie, anio) do update
    set ultimo_numero = public.correlativos.ultimo_numero + 1
  returning ultimo_numero into v_correlativo;

  v_numero := 'OP-' || v_anio::text || '-' || lpad(v_correlativo::text, 5, '0');

  insert into public.ordenes_pedido (numero, proveedor_id, fecha, fecha_estimada, creado_por)
  values (
    v_numero,
    p_proveedor_id,
    (now() at time zone 'America/El_Salvador')::date,
    p_fecha_estimada,
    v_usuario
  )
  returning id into v_orden_id;

  insert into public.detalle_orden_pedido (orden_pedido_id, producto_id, cantidad)
  select v_orden_id,
         (linea ->> 'producto_id')::bigint,
         (linea ->> 'cantidad')::integer
  from jsonb_array_elements(p_detalles) as detalle(linea);

  return v_orden_id;
end;
$$;

create or replace function private.cerrar_orden_pedido_core(p_orden_id bigint, p_motivo text)
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
    raise exception 'Solo administracion puede cerrar una orden manualmente.';
  end if;

  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Indique el motivo del cierre anticipado.';
  end if;

  update public.ordenes_pedido op
  set estado = 'cerrada', motivo_cierre = btrim(p_motivo)
  where op.id = p_orden_id and op.estado in ('abierta', 'parcial');

  if not found then
    raise exception 'La orden no existe o ya fue cerrada.';
  end if;
end;
$$;

revoke insert, update, delete, truncate
on table public.ordenes_pedido, public.detalle_orden_pedido
from public, anon, authenticated;

drop policy if exists ordenes_pedido_crear on public.ordenes_pedido;
drop policy if exists ordenes_pedido_editar on public.ordenes_pedido;
drop policy if exists detalle_op_crear on public.detalle_orden_pedido;
drop policy if exists detalle_op_editar on public.detalle_orden_pedido;

create or replace function public.crear_orden_pedido(
  p_proveedor_id bigint,
  p_fecha_estimada date,
  p_detalles jsonb
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.crear_orden_pedido_core(p_proveedor_id, p_fecha_estimada, p_detalles);
$$;

create or replace function public.cerrar_orden_pedido(p_orden_id bigint, p_motivo text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.cerrar_orden_pedido_core(p_orden_id, p_motivo);
$$;

revoke all on function private.crear_orden_pedido_core(bigint, date, jsonb) from public, anon;
revoke all on function private.cerrar_orden_pedido_core(bigint, text) from public, anon;
grant execute on function private.crear_orden_pedido_core(bigint, date, jsonb) to authenticated;
grant execute on function private.cerrar_orden_pedido_core(bigint, text) to authenticated;

revoke all on function public.crear_orden_pedido(bigint, date, jsonb) from public, anon;
revoke all on function public.cerrar_orden_pedido(bigint, text) from public, anon;
grant execute on function public.crear_orden_pedido(bigint, date, jsonb) to authenticated;
grant execute on function public.cerrar_orden_pedido(bigint, text) to authenticated;

create trigger bitacora_ordenes_pedido
  after insert or update or delete on public.ordenes_pedido
  for each row execute function private.registrar_bitacora();

create trigger bitacora_detalle_orden_pedido
  after insert or update or delete on public.detalle_orden_pedido
  for each row execute function private.registrar_bitacora();

create or replace function private.validar_orden_abierta_para_recepcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cantidad_recibida > old.cantidad_recibida and not exists (
    select 1 from public.ordenes_pedido op
    where op.id = old.orden_pedido_id and op.estado in ('abierta', 'parcial')
  ) then
    raise exception 'No se puede recibir producto de una orden cerrada.';
  end if;
  return new;
end;
$$;

revoke all on function private.validar_orden_abierta_para_recepcion() from public, anon, authenticated;

create trigger detalle_op_validar_orden_abierta
  before update of cantidad_recibida on public.detalle_orden_pedido
  for each row execute function private.validar_orden_abierta_para_recepcion();
