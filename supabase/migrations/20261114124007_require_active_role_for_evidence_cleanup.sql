-- Una cuenta desactivada conserva su JWT hasta que expire la sesión.
-- Solo perfiles activos de bodega pueden borrar cargas huérfanas.
alter policy evidencias_movimientos_limpiar_huerfana on storage.objects
  using (
    bucket_id = 'evidencias-movimientos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.rol_actual()) in ('administrador', 'jefe_bodega')
    and not exists (
      select 1 from public.documentos d where d.evidencia_url = storage.objects.name
    )
  );
