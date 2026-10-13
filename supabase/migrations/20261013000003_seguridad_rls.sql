-- =============================================================
-- Migración 3: Row Level Security por rol
-- administrador: todo · jefe_bodega: registra movimientos
-- vendedora: consulta stock y crea órdenes de pedido
-- Documentos, sus líneas, existencias y correlativos NO se escriben
-- directamente desde la aplicación: solo mediante funciones de
-- movimiento SECURITY DEFINER (se agregan en migraciones futuras),
-- que fijan el estado y la aprobación en el servidor.
-- =============================================================

alter table public.usuarios enable row level security;
alter table public.proveedores enable row level security;
alter table public.productos enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.existencias enable row level security;
alter table public.correlativos enable row level security;
alter table public.ordenes_pedido enable row level security;
alter table public.detalle_orden_pedido enable row level security;
alter table public.documentos enable row level security;
alter table public.detalle_documento enable row level security;
alter table public.reservas enable row level security;
alter table public.conteos enable row level security;
alter table public.detalle_conteo enable row level security;
alter table public.bitacora enable row level security;

-- ---------- Usuarios ----------
create policy usuarios_leer on public.usuarios
  for select to authenticated using (true);
create policy usuarios_crear on public.usuarios
  for insert to authenticated with check ((select private.rol_actual()) = 'administrador');
create policy usuarios_editar on public.usuarios
  for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

-- ---------- Catálogo: todos leen, el administrador mantiene ----------
create policy proveedores_leer on public.proveedores for select to authenticated using (true);
create policy proveedores_crear on public.proveedores for insert to authenticated
  with check ((select private.rol_actual()) = 'administrador');
create policy proveedores_editar on public.proveedores for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

create policy productos_leer on public.productos for select to authenticated using (true);
create policy productos_crear on public.productos for insert to authenticated
  with check ((select private.rol_actual()) = 'administrador');
create policy productos_editar on public.productos for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

create policy ubicaciones_leer on public.ubicaciones for select to authenticated using (true);
create policy ubicaciones_crear on public.ubicaciones for insert to authenticated
  with check ((select private.rol_actual()) = 'administrador');
create policy ubicaciones_editar on public.ubicaciones for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

-- ---------- Existencias y reservas: todos leen (consulta de stock) ----------
create policy existencias_leer on public.existencias for select to authenticated using (true);

create policy reservas_leer on public.reservas for select to authenticated using (true);
create policy reservas_crear on public.reservas for insert to authenticated
  with check (
    (select private.rol_actual()) in ('administrador', 'jefe_bodega')
    and creado_por = (select auth.uid())
    and estado = 'activa'
    and documento_id is null
  );
create policy reservas_editar on public.reservas for update to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'))
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Órdenes de pedido: administrador y vendedoras crean ----------
create policy ordenes_pedido_leer on public.ordenes_pedido for select to authenticated using (true);
create policy ordenes_pedido_crear on public.ordenes_pedido for insert to authenticated
  with check (
    (select private.rol_actual()) in ('administrador', 'vendedora')
    and creado_por = (select auth.uid())
    and estado = 'abierta'
  );
create policy ordenes_pedido_editar on public.ordenes_pedido for update to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'))
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

create policy detalle_op_leer on public.detalle_orden_pedido for select to authenticated using (true);
create policy detalle_op_crear on public.detalle_orden_pedido for insert to authenticated
  with check (
    cantidad_recibida = 0
    and exists (
      select 1 from public.ordenes_pedido op
      where op.id = orden_pedido_id
        and op.estado = 'abierta'
        and op.creado_por = (select auth.uid())
    )
  );
create policy detalle_op_editar on public.detalle_orden_pedido for update to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'))
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Documentos: lectura para administrador y jefe de bodega ----------
-- Sin políticas de inserción: se crean solo con funciones de movimiento.
create policy documentos_leer on public.documentos for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
-- El administrador aprueba, rechaza o anula; queda registrado como quien aprobó
create policy documentos_aprobar on public.documentos for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check (
    (select private.rol_actual()) = 'administrador'
    and (aprobado_por is null or aprobado_por = (select auth.uid()))
  );

create policy detalle_documento_leer on public.detalle_documento for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Conteos ----------
create policy conteos_leer on public.conteos for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy conteos_crear on public.conteos for insert to authenticated
  with check (
    (select private.rol_actual()) in ('administrador', 'jefe_bodega')
    and creado_por = (select auth.uid())
    and estado = 'pendiente'
    and documento_ajuste_id is null
  );
create policy conteos_editar on public.conteos for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

create policy detalle_conteo_leer on public.detalle_conteo for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy detalle_conteo_crear on public.detalle_conteo for insert to authenticated
  with check (
    exists (
      select 1 from public.conteos c
      where c.id = conteo_id
        and c.estado = 'pendiente'
        and c.creado_por = (select auth.uid())
    )
  );

-- ---------- Bitácora: solo el administrador la lee; nadie la edita (RNF-13) ----------
create policy bitacora_leer on public.bitacora for select to authenticated
  using ((select private.rol_actual()) = 'administrador');
revoke update, delete, truncate on public.bitacora from anon, authenticated;

-- Sin acceso para usuarios no autenticados
revoke all on all tables in schema public from anon;

-- Actualizaciones en tiempo real de la consulta de stock (RNF-04)
alter publication supabase_realtime add table public.existencias, public.reservas;
