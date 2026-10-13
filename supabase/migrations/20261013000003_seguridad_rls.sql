-- =============================================================
-- Migración 3: Row Level Security por rol
-- administrador: todo · jefe_bodega: registra movimientos
-- vendedora: consulta stock y crea órdenes de pedido
-- Las existencias y los correlativos solo cambian mediante
-- funciones de movimiento (se agregan en migraciones futuras).
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
  );
create policy ordenes_pedido_editar on public.ordenes_pedido for update to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'))
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

create policy detalle_op_leer on public.detalle_orden_pedido for select to authenticated using (true);
create policy detalle_op_crear on public.detalle_orden_pedido for insert to authenticated
  with check ((select private.rol_actual()) in ('administrador', 'vendedora'));
create policy detalle_op_editar on public.detalle_orden_pedido for update to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'))
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Documentos: administrador y jefe de bodega ----------
create policy documentos_leer on public.documentos for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy documentos_crear on public.documentos for insert to authenticated
  with check (
    (select private.rol_actual()) in ('administrador', 'jefe_bodega')
    and creado_por = (select auth.uid())
  );
create policy documentos_aprobar on public.documentos for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

create policy detalle_documento_leer on public.detalle_documento for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy detalle_documento_crear on public.detalle_documento for insert to authenticated
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Conteos ----------
create policy conteos_leer on public.conteos for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy conteos_crear on public.conteos for insert to authenticated
  with check (
    (select private.rol_actual()) in ('administrador', 'jefe_bodega')
    and creado_por = (select auth.uid())
  );
create policy conteos_editar on public.conteos for update to authenticated
  using ((select private.rol_actual()) = 'administrador')
  with check ((select private.rol_actual()) = 'administrador');

create policy detalle_conteo_leer on public.detalle_conteo for select to authenticated
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
create policy detalle_conteo_crear on public.detalle_conteo for insert to authenticated
  with check ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));

-- ---------- Bitácora: solo el administrador la lee; nadie la edita (RNF-13) ----------
create policy bitacora_leer on public.bitacora for select to authenticated
  using ((select private.rol_actual()) = 'administrador');
revoke update, delete, truncate on public.bitacora from anon, authenticated;

-- Sin acceso para usuarios no autenticados
revoke all on all tables in schema public from anon;

-- Actualizaciones en tiempo real de la consulta de stock (RNF-04)
alter publication supabase_realtime add table public.existencias, public.reservas;
