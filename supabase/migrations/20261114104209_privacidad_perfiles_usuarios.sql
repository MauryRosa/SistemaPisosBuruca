-- Los perfiles completos solo son visibles para administración y para su titular.
alter policy usuarios_leer on public.usuarios
  using (
    (id = (select auth.uid()) and activo)
    or (select private.rol_actual()) = 'administrador'
  );

-- Los flujos operativos solo necesitan el identificador y el nombre del personal.
create or replace view public.v_usuarios_nombres_operativos
with (security_invoker = false) as
select u.id, u.nombre
from public.usuarios u
where (select private.rol_actual()) is not null;

create or replace view public.v_vendedoras_activas
with (security_invoker = false) as
select u.id, u.nombre
from public.usuarios u
where u.activo
  and u.rol = 'vendedora'
  and (select private.rol_actual()) in ('administrador', 'jefe_bodega');

revoke all on public.v_usuarios_nombres_operativos, public.v_vendedoras_activas
  from public, anon;
grant select on public.v_usuarios_nombres_operativos, public.v_vendedoras_activas
  to authenticated;

-- El dashboard conserva los nombres sin exponer login, rol ni estado de perfiles.
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
join public.v_usuarios_nombres_operativos u on u.id = d.creado_por;
