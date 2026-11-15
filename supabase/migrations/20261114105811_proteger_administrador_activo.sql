-- La función serializada se define en 20261114103000_serializar_admin_activo.sql.
-- Esta migración instala su trigger sin reemplazar la protección de concurrencia.
create trigger usuarios_proteger_administrador_activo
  before update of activo, rol on public.usuarios
  for each row execute function private.proteger_administrador_activo();
