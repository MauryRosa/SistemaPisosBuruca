-- Acelera el filtrado y orden de las colas con paginación del servidor.
create index documentos_pendientes_paginacion_idx
  on public.documentos (fecha asc, id asc)
  where estado = 'pendiente';

create index conteos_pendientes_paginacion_idx
  on public.conteos (fecha desc, id desc)
  where estado = 'pendiente';
