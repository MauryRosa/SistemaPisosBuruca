import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarTodas } from '../lib/consultarTodas.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

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
      const { data: documentos, error } = await supabase
        .from('documentos')
        .select('id,serie,anio,correlativo,fecha,creado_por,motivo,es_contingencia,traslado_confirmado_en,traslado_confirmado_por')
        .eq('tipo', 'traslado')
        .eq('estado', 'aprobado')
        .order('fecha', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (documentos.length === 0) return [];

      const ids = documentos.map((documento) => documento.id);
      const usuarioIds = [...new Set(documentos.flatMap((documento) => [
        documento.creado_por,
        documento.traslado_confirmado_por,
      ]).filter(Boolean))];
      const [lineasResultado, usuariosResultado] = await Promise.all([
        supabase
          .from('detalle_documento')
          .select('id,documento_id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion')
          .in('documento_id', ids)
          .order('id'),
        supabase
          .from('v_usuarios_nombres_operativos')
          .select('id,nombre')
          .in('id', usuarioIds),
      ]);
      const lineas = comprobar(lineasResultado);
      const usuarios = comprobar(usuariosResultado);
      const productoIds = [...new Set(lineas.map((linea) => linea.producto_id))];
      const ubicacionIds = [...new Set(lineas.flatMap((linea) => [linea.ubicacion_origen_id, linea.ubicacion_destino_id]))];
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
