import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

export function useCatalogoEntradas() {
  return useQuery({
    queryKey: ['catalogo-entradas'],
    queryFn: async () => {
      const [productosResultado, ubicacionesResultado, ordenesResultado] = await Promise.all([
        supabase.from('productos').select('id,codigo,nombre,tipo,unidad,piezas_por_caja').eq('activo', true).order('nombre'),
        supabase.from('ubicaciones').select('id,nombre').eq('tipo', 'bodega').eq('activa', true).order('nombre'),
        supabase
          .from('ordenes_pedido')
          .select('id,numero,fecha,fecha_estimada,estado,proveedor_id')
          .in('estado', ['abierta', 'parcial'])
          .order('fecha', { ascending: false }),
      ]);
      const productos = comprobar(productosResultado);
      const ubicaciones = comprobar(ubicacionesResultado);
      const ordenes = comprobar(ordenesResultado);
      const proveedorIds = [...new Set(ordenes.map((orden) => orden.proveedor_id))];
      const proveedores = proveedorIds.length
        ? comprobar(await supabase.from('proveedores').select('id,nombre').in('id', proveedorIds))
        : [];
      const porProveedor = new Map(proveedores.map((proveedor) => [proveedor.id, proveedor.nombre]));

      return {
        productos,
        ubicaciones,
        ordenes: ordenes.map((orden) => ({
          ...orden,
          proveedor: porProveedor.get(orden.proveedor_id) || 'Proveedor no disponible',
        })),
      };
    },
  });
}

export function useDetalleOrdenEntrada(ordenId) {
  return useQuery({
    queryKey: ['entrada', 'orden', ordenId],
    enabled: Boolean(ordenId),
    queryFn: async () => {
      const detalles = comprobar(await supabase
        .from('detalle_orden_pedido')
        .select('id,producto_id,cantidad,cantidad_recibida')
        .eq('orden_pedido_id', ordenId)
        .order('id'));
      const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
      const productos = productoIds.length
        ? comprobar(await supabase
          .from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .in('id', productoIds))
        : [];
      const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
      return detalles.map((detalle) => ({ ...detalle, producto: porProducto.get(detalle.producto_id) }));
    },
  });
}

export function useDocumentoVentaOriginal(tipo, numero) {
  return useQuery({
    queryKey: ['entrada', 'devolucion-cliente', 'documento', tipo, numero],
    enabled: Boolean(tipo && numero.trim()),
    queryFn: async () => {
      const { data, error } = await supabase.from('documentos')
        .select('id,serie,anio,correlativo,tipo')
        .in('tipo', ['salida_venta', 'despacho_minibodega'])
        .eq('doc_venta_tipo', tipo)
        .eq('doc_venta_numero', numero.trim())
        .eq('estado', 'aprobado')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useExistenciasIniciales(ubicacionId) {
  return useQuery({
    queryKey: ['entrada', 'existencias-iniciales', ubicacionId],
    enabled: Boolean(ubicacionId),
    queryFn: async () => comprobar(await supabase
      .from('existencias')
      .select('producto_id,cantidad')
      .eq('ubicacion_id', ubicacionId)
      .gt('cantidad', 0)),
  });
}

export function useRegistrarMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipo, cabecera, detalles }) => {
      const { data, error } = await supabase.rpc('registrar_movimiento', {
        p_tipo: tipo,
        p_cabecera: cabecera,
        p_detalles: detalles,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entradas'] }),
        queryClient.invalidateQueries({ queryKey: ['catalogo-entradas'] }),
        queryClient.invalidateQueries({ queryKey: ['entrada'] }),
        queryClient.invalidateQueries({ queryKey: ['pedidos'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['aprobaciones'] }),
      ]);
    },
  });
}
