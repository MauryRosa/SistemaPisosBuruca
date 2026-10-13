-- =============================================================
-- Pisos Buruca · Sistema de control de inventario
-- Migración 1: tipos enumerados y tablas
-- Regla clave: el saldo solo cambia mediante un documento y su
-- detalle; todas las cantidades se guardan en unidad base
-- (piezas para pisos, unidades para accesorios).
-- =============================================================

-- ---------- Tipos enumerados ----------
create type public.rol_usuario as enum ('administrador', 'jefe_bodega', 'vendedora');
create type public.tipo_producto as enum ('piso', 'accesorio');
create type public.unidad_base as enum ('pieza', 'bolsa', 'unidad', 'paquete', 'galon');
create type public.modo_despacho as enum ('caja', 'pieza', 'ambos');
create type public.tipo_ubicacion as enum ('bodega', 'minibodega', 'exhibicion');
create type public.tipo_documento as enum (
  'entrada_compra', 'entrada_devolucion_cliente', 'entrada_cambio', 'inventario_inicial',
  'salida_venta', 'despacho_minibodega', 'traslado', 'merma', 'consumo_interno',
  'devolucion_proveedor', 'salida_cambio', 'ajuste_positivo', 'ajuste_negativo',
  'apertura_caja', 'anulacion'
);
create type public.doc_venta as enum ('factura', 'ccf', 'recibo');
create type public.estado_documento as enum ('pendiente', 'aprobado', 'rechazado', 'anulado');
create type public.estado_reserva as enum ('activa', 'consumida', 'cancelada');
create type public.estado_pedido as enum ('abierta', 'parcial', 'cerrada', 'anulada');
create type public.alcance_conteo as enum ('total', 'categoria');

-- ---------- Usuarios (perfil enlazado a Supabase Auth) ----------
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  usuario text not null unique,
  rol public.rol_usuario not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------- Catálogo ----------
create table public.proveedores (
  id bigint generated always as identity primary key,
  nombre text not null,
  contacto text,
  telefono text,
  correo text,
  activo boolean not null default true
);

create table public.productos (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  nombre text not null,
  tipo public.tipo_producto not null,
  categoria text not null,
  medida text,
  unidad public.unidad_base not null default 'pieza',
  piezas_por_caja integer check (piezas_por_caja > 0),
  despacho_por public.modo_despacho not null default 'ambos',
  stock_minimo integer not null default 0 check (stock_minimo >= 0),
  proveedor_id bigint references public.proveedores (id),
  activo boolean not null default true,
  -- Los pisos se manejan en cajas y piezas; los accesorios en una unidad simple
  constraint productos_piso_con_caja check (tipo <> 'piso' or piezas_por_caja is not null),
  constraint productos_unidad_piso check (tipo <> 'piso' or unidad = 'pieza')
);
create index productos_proveedor_id_idx on public.productos (proveedor_id);
create index productos_categoria_idx on public.productos (categoria);

create table public.ubicaciones (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  tipo public.tipo_ubicacion not null,
  vendible boolean not null default true,
  activa boolean not null default true
);

-- ---------- Existencias (saldo actual en unidad base) ----------
create table public.existencias (
  producto_id bigint not null references public.productos (id),
  ubicacion_id bigint not null references public.ubicaciones (id),
  cantidad integer not null default 0 check (cantidad >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, ubicacion_id)
);
create index existencias_ubicacion_id_idx on public.existencias (ubicacion_id);

-- ---------- Correlativos por serie y año ----------
create table public.correlativos (
  serie text not null,
  anio integer not null,
  ultimo_numero integer not null default 0,
  primary key (serie, anio)
);

-- ---------- Órdenes de pedido a proveedor ----------
create table public.ordenes_pedido (
  id bigint generated always as identity primary key,
  numero text not null unique,
  proveedor_id bigint not null references public.proveedores (id),
  fecha date not null default current_date,
  fecha_estimada date,
  estado public.estado_pedido not null default 'abierta',
  creado_por uuid not null references public.usuarios (id)
);
create index ordenes_pedido_proveedor_id_idx on public.ordenes_pedido (proveedor_id);
create index ordenes_pedido_creado_por_idx on public.ordenes_pedido (creado_por);

create table public.detalle_orden_pedido (
  id bigint generated always as identity primary key,
  orden_pedido_id bigint not null references public.ordenes_pedido (id) on delete cascade,
  producto_id bigint not null references public.productos (id),
  cantidad integer not null check (cantidad > 0),
  cantidad_recibida integer not null default 0 check (cantidad_recibida >= 0)
);
create index detalle_orden_pedido_orden_idx on public.detalle_orden_pedido (orden_pedido_id);
create index detalle_orden_pedido_producto_idx on public.detalle_orden_pedido (producto_id);

-- ---------- Documentos (cabecera de todo movimiento) ----------
create table public.documentos (
  id bigint generated always as identity primary key,
  tipo public.tipo_documento not null,
  serie text not null,
  anio integer not null,
  correlativo integer not null,
  fecha timestamptz not null default now(),
  doc_venta_tipo public.doc_venta,
  doc_venta_numero text,
  doc_proveedor_numero text,
  orden_pedido_id bigint references public.ordenes_pedido (id),
  documento_origen_id bigint references public.documentos (id),
  estado public.estado_documento not null default 'aprobado',
  motivo text,
  creado_por uuid not null references public.usuarios (id),
  aprobado_por uuid references public.usuarios (id),
  aprobado_en timestamptz,
  retira_nombre text,
  placa text,
  evidencia_url text,
  es_contingencia boolean not null default false,
  unique (serie, anio, correlativo),
  constraint documentos_venta_con_numero check (
    tipo not in ('salida_venta', 'despacho_minibodega')
    or (doc_venta_tipo is not null and doc_venta_numero is not null)
  )
);
-- RF-18: un mismo documento de venta solo se liga a una salida no anulada
create unique index documentos_doc_venta_unico_idx
  on public.documentos (doc_venta_tipo, doc_venta_numero)
  where tipo in ('salida_venta', 'despacho_minibodega') and estado <> 'anulado';
create index documentos_fecha_idx on public.documentos (fecha desc);
create index documentos_estado_idx on public.documentos (estado) where estado = 'pendiente';
create index documentos_orden_pedido_id_idx on public.documentos (orden_pedido_id);
create index documentos_documento_origen_id_idx on public.documentos (documento_origen_id);
create index documentos_creado_por_idx on public.documentos (creado_por);
create index documentos_aprobado_por_idx on public.documentos (aprobado_por);

create table public.detalle_documento (
  id bigint generated always as identity primary key,
  documento_id bigint not null references public.documentos (id) on delete cascade,
  producto_id bigint not null references public.productos (id),
  ubicacion_origen_id bigint references public.ubicaciones (id),
  ubicacion_destino_id bigint references public.ubicaciones (id),
  cantidad integer not null check (cantidad > 0),
  observacion text,
  constraint detalle_con_ubicacion check (ubicacion_origen_id is not null or ubicacion_destino_id is not null)
);
create index detalle_documento_documento_idx on public.detalle_documento (documento_id);
create index detalle_documento_producto_idx on public.detalle_documento (producto_id);
create index detalle_documento_origen_idx on public.detalle_documento (ubicacion_origen_id);
create index detalle_documento_destino_idx on public.detalle_documento (ubicacion_destino_id);

-- ---------- Reservas ----------
create table public.reservas (
  id bigint generated always as identity primary key,
  producto_id bigint not null references public.productos (id),
  ubicacion_id bigint not null references public.ubicaciones (id),
  cantidad integer not null check (cantidad > 0),
  vendedora_id uuid not null references public.usuarios (id),
  doc_venta_tipo public.doc_venta,
  doc_venta_numero text,
  estado public.estado_reserva not null default 'activa',
  motivo_cancelacion text,
  documento_id bigint references public.documentos (id),
  creado_por uuid not null references public.usuarios (id),
  creado_en timestamptz not null default now(),
  constraint reservas_cancelada_con_motivo check (estado <> 'cancelada' or motivo_cancelacion is not null)
);
create index reservas_activas_idx on public.reservas (producto_id, ubicacion_id) where estado = 'activa';
create index reservas_ubicacion_id_idx on public.reservas (ubicacion_id);
create index reservas_vendedora_id_idx on public.reservas (vendedora_id);
create index reservas_documento_id_idx on public.reservas (documento_id);
create index reservas_creado_por_idx on public.reservas (creado_por);

-- ---------- Conteos físicos ----------
create table public.conteos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  alcance public.alcance_conteo not null,
  categoria text,
  ubicacion_id bigint not null references public.ubicaciones (id),
  estado public.estado_documento not null default 'pendiente',
  creado_por uuid not null references public.usuarios (id),
  documento_ajuste_id bigint references public.documentos (id)
);
create index conteos_ubicacion_id_idx on public.conteos (ubicacion_id);
create index conteos_creado_por_idx on public.conteos (creado_por);
create index conteos_documento_ajuste_id_idx on public.conteos (documento_ajuste_id);

create table public.detalle_conteo (
  id bigint generated always as identity primary key,
  conteo_id bigint not null references public.conteos (id) on delete cascade,
  producto_id bigint not null references public.productos (id),
  cantidad_sistema integer not null,
  cantidad_contada integer not null check (cantidad_contada >= 0),
  diferencia integer generated always as (cantidad_contada - cantidad_sistema) stored
);
create index detalle_conteo_conteo_idx on public.detalle_conteo (conteo_id);
create index detalle_conteo_producto_idx on public.detalle_conteo (producto_id);

-- ---------- Bitácora de auditoría (solo inserción) ----------
create table public.bitacora (
  id bigint generated always as identity primary key,
  usuario_id uuid references public.usuarios (id),
  fecha_hora timestamptz not null default now(),
  accion text not null,
  tabla text not null,
  registro_id text,
  valor_anterior jsonb,
  valor_nuevo jsonb
);
create index bitacora_usuario_id_idx on public.bitacora (usuario_id);
create index bitacora_fecha_idx on public.bitacora (fecha_hora desc);
