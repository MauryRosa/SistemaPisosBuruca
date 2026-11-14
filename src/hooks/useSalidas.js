import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarPorIds, consultarTodas } from '../lib/consultarTodas.js';

export function useCatalogoSalidas() {
  return useQuery({
    queryKey: ['catalogo-salidas'],
    queryFn: async () => {
      const [productos, ubicaciones, compras] = await Promise.all([
        consultarTodas(() => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja,despacho_por')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id,nombre,tipo')
          .eq('activa', true)
          .in('tipo', ['bodega', 'minibodega'])
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('documentos')
          .select('id,serie,anio,correlativo,fecha,doc_proveedor_numero,orden_pedido_id')
          .eq('tipo', 'entrada_compra')
          .eq('estado', 'aprobado')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })),
      ]);
      return {
        productos,
        ubicaciones,
        compras: compras.map((documento) => ({
          ...documento,
          numero: `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`,
        })),
      };
    },
  });
}

export function useStockSalida(ubicacionId) {
  return useQuery({
    queryKey: ['salidas', 'stock', ubicacionId],
    enabled: Boolean(ubicacionId),
    queryFn: () => consultarTodas(() => supabase
      .from('v_stock')
      .select('producto_id,codigo,nombre,tipo,unidad,piezas_por_caja,fisico,reservado,disponible')
      .eq('ubicacion_id', ubicacionId)
      .order('nombre')
      .order('producto_id')),
  });
}

export function useReservasPorVenta(tipo, numero, ubicacionId) {
  return useQuery({
    queryKey: ['salidas', 'reservas', tipo, numero, ubicacionId],
    enabled: Boolean(tipo && numero.trim() && ubicacionId),
    queryFn: () => consultarTodas(() => supabase
      .from('reservas')
      .select('id,producto_id,ubicacion_id,cantidad')
      .eq('estado', 'activa')
      .eq('doc_venta_tipo', tipo)
      .eq('doc_venta_numero', numero.trim())
      .eq('ubicacion_id', ubicacionId)
      .order('id')),
  });
}

export function useDocumentoSalida(documentoId) {
  return useQuery({
    queryKey: ['salidas', 'comprobante', documentoId],
    enabled: Boolean(documentoId),
    queryFn: async () => {
      const { data: documento, error: errorDocumento } = await supabase.from('documentos')
        .select('id,serie,anio,correlativo,fecha,tipo,doc_venta_tipo,doc_venta_numero,retira_nombre,placa,motivo,evidencia_url,es_contingencia,creado_por')
        .eq('id', documentoId)
        .single();
      if (errorDocumento) throw errorDocumento;
      const detalles = await consultarTodas(() => supabase.from('detalle_documento')
        .select('id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad')
        .eq('documento_id', documentoId)
        .order('id'));
      const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
      const ubicacionIds = [...new Set(detalles.flatMap((detalle) => [detalle.ubicacion_origen_id, detalle.ubicacion_destino_id]).filter(Boolean))];
      const [productosResultado, ubicacionesResultado, usuarioResultado] = await Promise.all([
        consultarPorIds(productoIds, (ids) => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .in('id', ids)),
        consultarPorIds(ubicacionIds, (ids) => supabase.from('ubicaciones')
          .select('id,nombre')
          .in('id', ids)),
        documento.creado_por
          ? supabase.from('v_usuarios_nombres_operativos').select('id,nombre').eq('id', documento.creado_por).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (usuarioResultado.error) throw usuarioResultado.error;
      const porProducto = new Map(productosResultado.map((producto) => [producto.id, producto]));
      const porUbicacion = new Map(ubicacionesResultado.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
      return {
        documento: { ...documento, creador: usuarioResultado.data?.nombre || 'Usuario no disponible' },
        detalles: detalles.map((detalle) => ({
          ...detalle,
          producto: porProducto.get(detalle.producto_id),
          origen: porUbicacion.get(detalle.ubicacion_origen_id) || '',
          destino: porUbicacion.get(detalle.ubicacion_destino_id) || '',
        })),
      };
    },
  });
}

const EXTENSIONES_EVIDENCIA = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

async function subirEvidencia(archivo) {
  if (!archivo) return null;
  const extension = EXTENSIONES_EVIDENCIA[archivo.type];
  if (!extension) throw new Error('Adjunta una imagen JPG, PNG, WebP o un PDF.');
  if (archivo.size > 10 * 1024 * 1024) throw new Error('La evidencia no puede superar 10 MB.');
  const { data: usuarioResultado, error: usuarioError } = await supabase.auth.getUser();
  if (usuarioError) throw usuarioError;
  if (!usuarioResultado.user) throw new Error('La sesión expiró. Inicia sesión de nuevo.');

  const ruta = `${usuarioResultado.user.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from('evidencias-movimientos')
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (error) throw error;
  return ruta;
}

export function useRegistrarSalida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, cabecera, detalles, archivo }) => {
      const evidenciaUrl = await subirEvidencia(archivo);
      const { data, error } = await supabase.rpc('registrar_movimiento', {
        p_tipo: tipo,
        p_cabecera: { ...cabecera, ...(evidenciaUrl ? { evidencia_url: evidenciaUrl } : {}) },
        p_detalles: detalles,
      });
      if (error) {
        if (evidenciaUrl) {
          await supabase.storage.from('evidencias-movimientos').remove([evidenciaUrl]);
        }
        throw error;
      }
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['salidas'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['aprobaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['reservas'] }),
        queryClient.invalidateQueries({ queryKey: ['movimientos'] }),
      ]);
    },
  });
}

export function useRegistrarAperturaCaja() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ ubicacionId, detalles, esContingencia }) => {
      const { data, error } = await supabase.rpc('registrar_apertura_caja', {
        p_ubicacion_id: ubicacionId,
        p_detalles: detalles,
        p_es_contingencia: esContingencia,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['salidas'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reportes'] }),
        queryClient.invalidateQueries({ queryKey: ['bitacora'] }),
      ]);
    },
  });
}
