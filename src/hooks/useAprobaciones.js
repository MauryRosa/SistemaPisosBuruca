import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function consultarAprobaciones() {
  const { data: documentos, error } = await supabase
    .from('documentos')
    .select('id,tipo,serie,anio,correlativo,fecha,motivo,es_contingencia,evidencia_url,doc_venta_tipo,doc_venta_numero,doc_proveedor_numero,creado_por,orden_pedido_id')
    .eq('estado', 'pendiente')
    .order('fecha', { ascending: true })
    .limit(100);
  if (error) throw error;
  if (documentos.length === 0) return [];

  const documentoIds = documentos.map((documento) => documento.id);
  const [lineasResultado, usuariosResultado] = await Promise.all([
    supabase
      .from('detalle_documento')
      .select('id,documento_id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion')
      .in('documento_id', documentoIds)
      .order('id'),
    supabase
      .from('usuarios')
      .select('id,nombre')
      .in('id', [...new Set(documentos.map((documento) => documento.creado_por))]),
  ]);
  const lineas = comprobar(lineasResultado);
  const usuarios = comprobar(usuariosResultado);

  const evidencias = await Promise.all(documentos.map(async (documento) => {
    const evidencia = documento.evidencia_url;
    if (!evidencia) return [documento.id, null];
    const { data, error: evidenciaError } = await supabase.storage
      .from('evidencias-movimientos')
      .createSignedUrl(evidencia, 3600);
    return [documento.id, evidenciaError ? null : data.signedUrl];
  }));

  const productoIds = [...new Set(lineas.map((linea) => linea.producto_id))];
  const ubicacionIds = [...new Set(lineas.flatMap((linea) => [
    linea.ubicacion_origen_id,
    linea.ubicacion_destino_id,
  ]).filter(Boolean))];
  const [productosResultado, ubicacionesResultado] = await Promise.all([
    productoIds.length
      ? supabase.from('productos').select('id,codigo,nombre,tipo,unidad,piezas_por_caja').in('id', productoIds)
      : Promise.resolve({ data: [], error: null }),
    ubicacionIds.length
      ? supabase.from('ubicaciones').select('id,nombre').in('id', ubicacionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const productos = comprobar(productosResultado);
  const ubicaciones = comprobar(ubicacionesResultado);

  const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
  const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
  const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  const porEvidencia = new Map(evidencias);
  const lineasPorDocumento = new Map();

  for (const linea of lineas) {
    const grupo = lineasPorDocumento.get(linea.documento_id) || [];
    grupo.push({
      ...linea,
      producto: porProducto.get(linea.producto_id),
      origen: porUbicacion.get(linea.ubicacion_origen_id),
      destino: porUbicacion.get(linea.ubicacion_destino_id),
    });
    lineasPorDocumento.set(linea.documento_id, grupo);
  }

  return documentos.map((documento) => ({
    ...documento,
    numero: `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`,
    creador: porUsuario.get(documento.creado_por) || 'Usuario no disponible',
    evidencia_enlace: porEvidencia.get(documento.id) || null,
    lineas: lineasPorDocumento.get(documento.id) || [],
  }));
}

export function useAprobaciones() {
  return useQuery({ queryKey: ['aprobaciones'], queryFn: consultarAprobaciones });
}

function useAccionAprobacion(nombreFuncion) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (argumentos) => {
      const { error } = await supabase.rpc(nombreFuncion, argumentos);
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['aprobaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      ]);
    },
  });
}

export function useAprobarMovimiento() {
  return useAccionAprobacion('aprobar_movimiento');
}

export function useRechazarMovimiento() {
  return useAccionAprobacion('rechazar_movimiento');
}
