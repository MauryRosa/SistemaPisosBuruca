import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarPorIds, consultarTodas } from '../lib/consultarTodas.js';

export function useCatalogoTraslados() {
  return useQuery({
    queryKey: ['catalogo-traslados'],
    queryFn: async () => {
      const [productos, ubicaciones] = await Promise.all([
        consultarTodas(() => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id,nombre,tipo')
          .eq('activa', true)
          .in('tipo', ['bodega', 'minibodega', 'exhibicion'])
          .order('nombre')
          .order('id')),
      ]);
      return {
        productos,
        ubicaciones,
      };
    },
  });
}

export function useStockTraslado(ubicacionId) {
  return useQuery({
    queryKey: ['traslado', 'stock', ubicacionId],
    enabled: Boolean(ubicacionId),
    queryFn: () => consultarTodas(() => supabase
      .from('v_stock')
      .select('producto_id,codigo,nombre,tipo,unidad,piezas_por_caja,fisico,reservado,disponible')
      .eq('ubicacion_id', ubicacionId)
      .order('nombre')
      .order('producto_id')),
  });
}

export function useTrasladosEnTransito() {
  return useQuery({
    queryKey: ['traslados', 'en-transito'],
    queryFn: async () => {
      const [enTransito, recibidosRecientes] = await Promise.all([
        consultarTodas(() => supabase
          .from('documentos')
          .select('id,serie,anio,correlativo,fecha,creado_por,motivo,es_contingencia,traslado_confirmado_en,traslado_confirmado_por')
          .eq('tipo', 'traslado')
          .eq('estado', 'aprobado')
          .is('traslado_confirmado_en', null)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })),
        (async () => {
          const { data, error } = await supabase
            .from('documentos')
            .select('id,serie,anio,correlativo,fecha,creado_por,motivo,es_contingencia,traslado_confirmado_en,traslado_confirmado_por')
            .eq('tipo', 'traslado')
            .eq('estado', 'aprobado')
            .not('traslado_confirmado_en', 'is', null)
            .order('fecha', { ascending: false })
            .order('id', { ascending: false })
            .limit(100);
          if (error) throw error;
          return data || [];
        })(),
      ]);
      const documentos = [...enTransito, ...recibidosRecientes]
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
      if (documentos.length === 0) return [];

      const ids = documentos.map((documento) => documento.id);
      const usuarioIds = [...new Set(documentos.flatMap((documento) => [
        documento.creado_por,
        documento.traslado_confirmado_por,
      ]).filter(Boolean))];
      const [lineas, usuarios] = await Promise.all([
        consultarPorIds(ids, (grupoIds) => supabase
          .from('detalle_documento')
          .select('id,documento_id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion')
          .in('documento_id', grupoIds)
          .order('id')),
        consultarPorIds(usuarioIds, (grupoIds) => supabase
          .from('v_usuarios_nombres_operativos')
          .select('id,nombre')
          .in('id', grupoIds)),
      ]);
      const productoIds = [...new Set(lineas.map((linea) => linea.producto_id))];
      const ubicacionIds = [...new Set(lineas.flatMap((linea) => [linea.ubicacion_origen_id, linea.ubicacion_destino_id]))];
      const [productos, ubicaciones] = await Promise.all([
        consultarPorIds(productoIds, (grupoIds) => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .in('id', grupoIds)),
        consultarPorIds(ubicacionIds, (grupoIds) => supabase.from('ubicaciones')
          .select('id,nombre')
          .in('id', grupoIds)),
      ]);
      const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
      const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
      const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
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
        receptor: porUsuario.get(documento.traslado_confirmado_por) || null,
        lineas: lineasPorDocumento.get(documento.id) || [],
      }));
    },
  });
}

function useAccionTraslado(nombreFuncion) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (argumentos) => {
      const { data, error } = await supabase.rpc(nombreFuncion, argumentos);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['traslados'] }),
        queryClient.invalidateQueries({ queryKey: ['traslado'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export function useCrearTraslado() {
  return useAccionTraslado('registrar_movimiento');
}

export function useConfirmarTraslado() {
  return useAccionTraslado('confirmar_traslado');
}
