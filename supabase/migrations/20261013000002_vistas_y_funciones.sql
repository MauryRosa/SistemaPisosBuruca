-- =============================================================
-- Migración 2: funciones auxiliares, vistas de consulta,
-- resumen del dashboard, bitácora y protección de documentos
-- =============================================================

-- Esquema privado: no se expone por la API de Supabase
create schema if not exists private;
grant usage on schema private to authenticated;

-- Rol del usuario autenticado (se usa en las políticas RLS)
create or replace function private.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select u.rol
  from public.usuarios u
  where u.id = (select auth.uid()) and u.activo;
$$;
revoke execute on function private.rol_actual() from public, anon;
grant execute on function private.rol_actual() to authenticated;

-- ---------- Stock por producto y ubicación (RF-36) ----------
-- Disponible = físico − reservas activas, solo en ubicaciones vendibles.
create or replace view public.v_stock
with (security_invoker = true) as
select
  p.id as producto_id,
  p.codigo,
  p.nombre,
  p.tipo,
  p.categoria,
  p.medida,
  p.unidad,
  p.piezas_por_caja,
  p.stock_minimo,
  u.id as ubicacion_id,
  u.nombre as ubicacion,
  u.tipo as ubicacion_tipo,
  u.vendible,
  coalesce(e.cantidad, 0) as fisico,
  coalesce(r.reservado, 0) as reservado,
  case when u.vendible then greatest(coalesce(e.cantidad, 0) - coalesce(r.reservado, 0), 0) else 0 end as disponible
from public.productos p
cross join public.ubicaciones u
left join public.existencias e on e.producto_id = p.id and e.ubicacion_id = u.id
left join (
  select producto_id, ubicacion_id, sum(cantidad)::integer as reservado
  from public.reservas
  where estado = 'activa'
  group by producto_id, ubicacion_id
) r on r.producto_id = p.id and r.ubicacion_id = u.id
where p.activo and u.activa;

-- ---------- Stock consolidado por producto ----------
create or replace view public.v_stock_total
with (security_invoker = true) as
select
  producto_id,
  codigo,
  nombre,
  tipo,
  categoria,
  medida,
  unidad,
  piezas_por_caja,
  stock_minimo,
  sum(fisico) filter (where vendible)::integer as fisico,
  sum(reservado)::integer as reservado,
  sum(disponible)::integer as disponible,
  coalesce(sum(fisico) filter (where not vendible), 0)::integer as en_exhibicion,
  (sum(disponible) < stock_minimo) as bajo_minimo
from public.v_stock
group by producto_id, codigo, nombre, tipo, categoria, medida, unidad, piezas_por_caja, stock_minimo;

-- ---------- Últimos movimientos (dashboard y bitácora) ----------
create or replace view public.v_movimientos
with (security_invoker = true) as
select
  d.id,
  d.tipo,
  d.serie || '-' || d.anio || '-' || lpad(d.correlativo::text, 5, '0') as numero,
  d.fecha,
  d.estado,
  d.doc_venta_tipo,
  d.doc_venta_numero,
  d.motivo,
  u.nombre as creado_por_nombre,
  (select count(*) from public.detalle_documento dd where dd.documento_id = d.id)::integer as lineas
from public.documentos d
join public.usuarios u on u.id = d.creado_por;

-- ---------- Resumen del dashboard ----------
create or replace function public.resumen_dashboard()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  select json_build_object(
    'aprobaciones_pendientes',
      (select count(*) from public.documentos where estado = 'pendiente')
      + (select count(*) from public.conteos where estado = 'pendiente'),
    'productos_bajo_minimo',
      (select count(*) from public.v_stock_total where bajo_minimo),
    'reservas_activas',
      (select count(*) from public.reservas where estado = 'activa'),
    'movimientos_hoy',
      (select count(*) from public.documentos
        where (fecha at time zone 'America/El_Salvador')::date
            = (now() at time zone 'America/El_Salvador')::date)
  );
$$;
grant execute on function public.resumen_dashboard() to authenticated;

-- ---------- Bitácora automática (RF-41) ----------
create or replace function private.registrar_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bitacora (usuario_id, accion, tabla, registro_id, valor_anterior, valor_nuevo)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(
      (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
      (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'producto_id'
    ),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger bitacora_usuarios after insert or update or delete on public.usuarios
  for each row execute function private.registrar_bitacora();
create trigger bitacora_productos after insert or update or delete on public.productos
  for each row execute function private.registrar_bitacora();
create trigger bitacora_proveedores after insert or update or delete on public.proveedores
  for each row execute function private.registrar_bitacora();
create trigger bitacora_ubicaciones after insert or update or delete on public.ubicaciones
  for each row execute function private.registrar_bitacora();
create trigger bitacora_documentos after insert or update or delete on public.documentos
  for each row execute function private.registrar_bitacora();
create trigger bitacora_reservas after insert or update or delete on public.reservas
  for each row execute function private.registrar_bitacora();

-- ---------- Documentos: no se borran ni se editan una vez aprobados (RF-25, RNF-01) ----------
create or replace function private.proteger_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'pendiente' then
      raise exception 'Los documentos aprobados no se eliminan; se anulan con un movimiento inverso.';
    end if;
    return old;
  end if;

  if old.estado in ('aprobado', 'rechazado', 'anulado')
     and (new.estado is distinct from old.estado and not (old.estado = 'aprobado' and new.estado = 'anulado')
          or (new.tipo, new.serie, new.anio, new.correlativo, new.fecha, new.doc_venta_tipo, new.doc_venta_numero)
             is distinct from
             (old.tipo, old.serie, old.anio, old.correlativo, old.fecha, old.doc_venta_tipo, old.doc_venta_numero))
  then
    raise exception 'Un documento % no se puede modificar; solo un documento aprobado puede pasar a anulado.', old.estado;
  end if;
  return new;
end;
$$;

create trigger documentos_proteger before update or delete on public.documentos
  for each row execute function private.proteger_documento();

-- ---------- Las líneas de un documento solo cambian mientras está pendiente ----------
create or replace function private.proteger_detalle_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  estado_padre public.estado_documento;
begin
  select d.estado into estado_padre
  from public.documentos d
  where d.id = coalesce(new.documento_id, old.documento_id);

  if estado_padre is distinct from 'pendiente' then
    raise exception 'Las líneas de un documento % no se pueden modificar.', coalesce(estado_padre::text, 'inexistente');
  end if;
  return coalesce(new, old);
end;
$$;

create trigger detalle_documento_proteger before insert or update or delete on public.detalle_documento
  for each row execute function private.proteger_detalle_documento();

