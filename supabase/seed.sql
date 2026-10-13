-- =============================================================
-- Datos de DEMOSTRACIÓN solo para el entorno local (supabase db reset).
-- No usar en producción: el catálogo real se carga desde el Excel de la empresa
-- y las cuentas reales las crea el administrador.
-- Contraseña de las cuentas demo: Demo1234!
-- =============================================================

-- ---------- Cuentas demo en Supabase Auth ----------
do $$
declare
  cuenta record;
begin
  for cuenta in
    select * from (values
      ('11111111-1111-1111-1111-111111111111'::uuid, 'admin', 'Administración (demo)', 'administrador'::public.rol_usuario),
      ('22222222-2222-2222-2222-222222222222'::uuid, 'bodega', 'Jefe de bodega (demo)', 'jefe_bodega'::public.rol_usuario),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'vendedora1', 'Vendedora 1 (demo)', 'vendedora'::public.rol_usuario)
    ) as t(id, usuario, nombre, rol)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', cuenta.id, 'authenticated', 'authenticated',
      cuenta.usuario || '@pisosburuca.local', extensions.crypt('Demo1234!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), cuenta.id, cuenta.id::text,
      jsonb_build_object('sub', cuenta.id::text, 'email', cuenta.usuario || '@pisosburuca.local'),
      'email', now(), now(), now()
    );
    insert into public.usuarios (id, nombre, usuario, rol) values (cuenta.id, cuenta.nombre, cuenta.usuario, cuenta.rol);
  end loop;
end $$;

-- ---------- Ubicaciones ----------
insert into public.ubicaciones (nombre, tipo, vendible) values
  ('Bodega principal', 'bodega', true),
  ('Minibodega de sala de ventas', 'minibodega', true),
  ('Exhibición', 'exhibicion', false);

-- ---------- Proveedores (ejemplo) ----------
insert into public.proveedores (nombre, contacto, telefono) values
  ('Proveedor de cerámica (demo)', 'Contacto demo', '0000-0000'),
  ('Proveedor de materiales (demo)', 'Contacto demo', '0000-0000');

-- ---------- Productos (ejemplo) ----------
insert into public.productos (codigo, nombre, tipo, categoria, medida, unidad, piezas_por_caja, despacho_por, stock_minimo, proveedor_id) values
  ('POR-6060-GR', 'Porcelanato gris cemento', 'piso', 'Porcelanato', '60x60', 'pieza', 4, 'ambos', 80, 1),
  ('POR-60120-MB', 'Porcelanato mármol blanco', 'piso', 'Porcelanato', '60x120', 'pieza', 2, 'ambos', 40, 1),
  ('POR-2090-MD', 'Porcelanato madera roble', 'piso', 'Porcelanato', '20x90', 'pieza', 8, 'ambos', 64, 1),
  ('CER-4545-BE', 'Cerámica beige rústica', 'piso', 'Cerámica', '45x45', 'pieza', 8, 'ambos', 96, 1),
  ('CER-3060-BL', 'Revestimiento blanco brillante', 'piso', 'Revestimiento de pared', '30x60', 'pieza', 8, 'ambos', 80, 1),
  ('PEG-FLEX-25', 'Pegamento flexible 25 kg', 'accesorio', 'Pegamentos', null, 'bolsa', null, 'pieza', 30, 2),
  ('BOQ-BL-5', 'Boquilla blanca 5 kg', 'accesorio', 'Boquillas', null, 'bolsa', null, 'pieza', 20, 2),
  ('SEP-2MM-100', 'Separadores 2 mm (bolsa de 100)', 'accesorio', 'Separadores', null, 'bolsa', null, 'pieza', 25, 2),
  ('NIV-KIT', 'Niveladores de piso', 'accesorio', 'Niveladores', null, 'paquete', null, 'pieza', 15, 2),
  ('MAL-DUCHA', 'Malla para ducha', 'accesorio', 'Mallas', null, 'unidad', null, 'pieza', 10, 2);

-- ---------- Existencias iniciales (unidad base: piezas o unidades) ----------
insert into public.existencias (producto_id, ubicacion_id, cantidad) values
  (1, 1, 401), (1, 2, 24), (1, 3, 4),
  (2, 1, 21),  (2, 2, 6),
  (3, 1, 320), (3, 2, 16),
  (4, 1, 60),  (4, 2, 8),
  (5, 1, 240), (5, 2, 40), (5, 3, 8),
  (6, 1, 45),  (6, 2, 10),
  (7, 1, 12),  (7, 2, 4),
  (8, 1, 60),
  (9, 1, 9),
  (10, 1, 18);

-- ---------- Movimientos de ejemplo para el dashboard ----------
insert into public.correlativos (serie, anio, ultimo_numero) values
  ('VTA', extract(year from now())::int, 2),
  ('MER', extract(year from now())::int, 1);

insert into public.documentos (tipo, serie, anio, correlativo, doc_venta_tipo, doc_venta_numero, estado, creado_por, retira_nombre)
values
  ('salida_venta', 'VTA', extract(year from now())::int, 1, 'factura', 'F-1001', 'aprobado', '22222222-2222-2222-2222-222222222222', 'Cliente demo'),
  ('salida_venta', 'VTA', extract(year from now())::int, 2, 'recibo', 'R-2045', 'aprobado', '22222222-2222-2222-2222-222222222222', 'Transportista demo');
insert into public.documentos (tipo, serie, anio, correlativo, estado, motivo, creado_por)
values ('merma', 'MER', extract(year from now())::int, 1, 'pendiente', 'Caja quebrada al descargar', '22222222-2222-2222-2222-222222222222');

insert into public.detalle_documento (documento_id, producto_id, ubicacion_origen_id, cantidad) values
  (1, 1, 1, 21), (2, 6, 1, 5), (3, 2, 1, 2);

-- ---------- Reserva de ejemplo ----------
insert into public.reservas (producto_id, ubicacion_id, cantidad, vendedora_id, doc_venta_tipo, doc_venta_numero, creado_por)
values (1, 1, 40, '33333333-3333-3333-3333-333333333333', 'factura', 'F-1002', '22222222-2222-2222-2222-222222222222');
