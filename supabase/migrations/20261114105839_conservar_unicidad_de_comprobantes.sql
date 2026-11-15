-- RF-18: un comprobante de venta no se reutiliza aunque su salida se anule.
drop index if exists public.documentos_doc_venta_unico_idx;

create unique index documentos_doc_venta_unico_idx
  on public.documentos (doc_venta_tipo, doc_venta_numero)
  where tipo in ('salida_venta', 'despacho_minibodega');
