-- Las sesiones de cuentas desactivadas pueden conservar un JWT válido.
-- Las lecturas protegidas por RLS también deben exigir un perfil activo.
alter policy usuarios_leer on public.usuarios
  using ((select private.rol_actual()) is not null);

alter policy proveedores_leer on public.proveedores
  using ((select private.rol_actual()) is not null);

alter policy productos_leer on public.productos
  using ((select private.rol_actual()) is not null);

alter policy ubicaciones_leer on public.ubicaciones
  using ((select private.rol_actual()) is not null);

alter policy existencias_leer on public.existencias
  using ((select private.rol_actual()) is not null);

alter policy reservas_leer on public.reservas
  using ((select private.rol_actual()) is not null);

alter policy ordenes_pedido_leer on public.ordenes_pedido
  using ((select private.rol_actual()) is not null);

alter policy detalle_op_leer on public.detalle_orden_pedido
  using ((select private.rol_actual()) is not null);
