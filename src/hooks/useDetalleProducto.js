import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

export function useDetalleProducto(productoId, mostrarMovimientos) {
  return useQuery({
    queryKey: ['producto', productoId, mostrarMovimientos],
    enabled: Number.isInteger(productoId) && productoId > 0,
    queryFn: async () => {
      const [productoResultado, stockResultado] = await Promise.all([
        supabase.from('productos')
          .select('id,codigo,nombre,tipo,categoria,medida,unidad,piezas_por_caja,despacho_por,stock_minimo,activo,proveedor_id')
          .eq('id', productoId)
          .single(),
        supabase.from('v_stock')
          .select('ubicacion_id,ubicacion,ubicacion_tipo,vendible,fisico,reservado,disponible')
          .eq('producto_id', productoId)
          .order('ubicacion'),
      ]);
      if (productoResultado.error) throw productoResultado.error;
      const producto = productoResultado.data;
      const existencias = comprobar(stockResultado);
      if (!mostrarMovimientos) return { producto, existencias, movimientos: [] };

      const detalles = comprobar(await supabase.from('detalle_documento')
        .select('id,documento_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion')
        .eq('producto_id', productoId)
        .order('id', { ascending: false })
        .limit(50));
      const documentoIds = [...new Set(detalles.map((detalle) => detalle.documento_id))];
      const ubicacionIds = [...new Set(detalles.flatMap((detalle) => [detalle.ubicacion_origen_id, detalle.ubicacion_destino_id]).filter(Boolean))];
      const [documentosResultado, ubicacionesResultado] = await Promise.all([
        documentoIds.length
          ? supabase.from('documentos').select('id,serie,anio,correlativo,tipo,fecha,estado,doc_venta_tipo,doc_venta_numero,motivo').in('id', documentoIds)
          : Promise.resolve({ data: [], error: null }),
        ubicacionIds.length
          ? supabase.from('ubicaciones').select('id,nombre').in('id', ubicacionIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const documentos = comprobar(documentosResultado);
      const ubicaciones = comprobar(ubicacionesResultado);
      const porDocumento = new Map(documentos.map((documento) => [documento.id, documento]));
      const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
      const movimientos = detalles.map((detalle) => {
        const documento = porDocumento.get(detalle.documento_id);
        if (!documento) return null;
        return {
          ...detalle,
          documento,
          numero: `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`,
          origen: porUbicacion.get(detalle.ubicacion_origen_id) || null,
          destino: porUbicacion.get(detalle.ubicacion_destino_id) || null,
        };
      }).filter(Boolean).sort((a, b) => b.documento.fecha.localeCompare(a.documento.fecha));
      return { producto, existencias, movimientos };
    },
  });
}
