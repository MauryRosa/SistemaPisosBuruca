-- La pantalla y el flujo de reservas están limitados a administración y bodega.
-- La misma restricción debe aplicarse a consultas directas por la API.
alter policy reservas_leer on public.reservas
  using ((select private.rol_actual()) in ('administrador', 'jefe_bodega'));
