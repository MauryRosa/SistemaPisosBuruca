import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

export function useCatalogosPedido() {
  return useQuery({
    queryKey: ['catalogos-pedidos'],
    queryFn: async () => {
      const [proveedoresResultado, productosResultado] = await Promise.all([
        supabase.from('proveedores').select('id,nombre,contacto,telefono,correo').eq('activo', true).order('nombre'),
        supabase
          .from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja,proveedor_id')
          .eq('activo', true)
          .order('nombre'),
      ]);
      return {
        proveedores: comprobar(proveedoresResultado),
        productos: comprobar(productosResultado),
      };
    },
  });
}

async function consultarPedidos() {
  const { data: ordenes, error } = await supabase
    .from('ordenes_pedido')
    .select('id,numero,fecha,fecha_estimada,estado,motivo_cierre,proveedor_id,creado_por')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false })
    .limit(100);
  if (error) throw error;
  if (ordenes.length === 0) return [];

  const ordenIds = ordenes.map((orden) => orden.id);
  const proveedorIds = [...new Set(ordenes.map((orden) => orden.proveedor_id))];
  const usuarioIds = [...new Set(ordenes.map((orden) => orden.creado_por))];
  const [proveedoresResultado, usuariosResultado, detallesResultado] = await Promise.all([
    supabase.from('proveedores').select('id,nombre,contacto,telefono,correo').in('id', proveedorIds),
    supabase.from('v_usuarios_nombres_operativos').select('id,nombre').in('id', usuarioIds),
    supabase
      .from('detalle_orden_pedido')
      .select('id,orden_pedido_id,producto_id,cantidad,cantidad_recibida')
      .in('orden_pedido_id', ordenIds)
      .order('id'),
  ]);
  const proveedores = comprobar(proveedoresResultado);
  const usuarios = comprobar(usuariosResultado);
  const detalles = comprobar(detallesResultado);
  const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
  const productos = productoIds.length
    ? comprobar(await supabase
      .from('productos')
      .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
      .in('id', productoIds))
    : [];

  const porProveedor = new Map(proveedores.map((proveedor) => [proveedor.id, proveedor]));
  const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
  const detallesPorOrden = new Map();
  for (const detalle of detalles) {
    const grupo = detallesPorOrden.get(detalle.orden_pedido_id) || [];
    grupo.push({ ...detalle, producto: porProducto.get(detalle.producto_id) });
    detallesPorOrden.set(detalle.orden_pedido_id, grupo);
  }

  return ordenes.map((orden) => ({
    ...orden,
    proveedor: porProveedor.get(orden.proveedor_id),
    creadoPorNombre: porUsuario.get(orden.creado_por) || 'Usuario no disponible',
    detalles: detallesPorOrden.get(orden.id) || [],
  }));
}

export function usePedidos() {
  return useQuery({ queryKey: ['pedidos'], queryFn: consultarPedidos });
}

function useAccionPedido(nombreFuncion) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (argumentos) => {
      const { data, error } = await supabase.rpc(nombreFuncion, argumentos);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pedidos'] });
    },
  });
}

export function useCrearPedido() {
  return useAccionPedido('crear_orden_pedido');
}

export function useCerrarPedido() {
  return useAccionPedido('cerrar_orden_pedido');
}
