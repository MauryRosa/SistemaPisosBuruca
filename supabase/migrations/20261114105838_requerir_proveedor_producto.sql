-- RF-01: cada producto del catálogo debe identificar a su proveedor.
alter table public.productos
  alter column proveedor_id set not null;
