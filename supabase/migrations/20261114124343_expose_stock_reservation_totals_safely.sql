-- El stock disponible requiere sumar reservas, pero los usuarios de ventas no
-- deben consultar sus filas. Esta vista expone únicamente totales por producto
-- y ubicación, y no devuelve datos a perfiles inactivos.
create or replace view public.v_reservas_stock_activas
with (security_invoker = false) as
select r.producto_id,
       r.ubicacion_id,
       sum(r.cantidad)::integer as reservado
from public.reservas r
where r.estado = 'activa'
  and (select private.rol_actual()) is not null
group by r.producto_id, r.ubicacion_id;

revoke all on public.v_reservas_stock_activas from public, anon, authenticated;
grant select on public.v_reservas_stock_activas to authenticated;

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
left join public.v_reservas_stock_activas r on r.producto_id = p.id and r.ubicacion_id = u.id
where p.activo and u.activa;

-- Los clientes reciben solo una señal de invalidación; nunca el contenido de
-- las filas privadas de reservas.
create or replace function private.notificar_invalidacion_stock_reservas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    '{}'::jsonb,
    'stock_invalidado',
    'stock:invalidacion',
    true
  );
  return null;
end;
$$;
revoke all on function private.notificar_invalidacion_stock_reservas() from public, anon, authenticated;

create trigger reservas_notificar_invalidacion_stock
after insert or update or delete on public.reservas
for each statement
execute function private.notificar_invalidacion_stock_reservas();

create policy stock_invalidacion_recibir_perfiles_activos
on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and (select realtime.topic()) = 'stock:invalidacion'
  and (select private.rol_actual()) is not null
);
