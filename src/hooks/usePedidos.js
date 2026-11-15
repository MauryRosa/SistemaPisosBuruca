import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarTodas } from '../lib/consultarTodas.js';

function dividirEnGrupos(valores, tamano = 200) {
  const grupos = [];
  for (let inicio = 0; inicio < valores.length; inicio += tamano) {
    grupos.push(valores.slice(inicio, inicio + tamano));
  }
  return grupos;
}

export function useCatalogosPedido() {
  return useQuery({
    queryKey: ['catalogos-pedidos'],
    queryFn: async () => {
      const [proveedores, productos] = await Promise.all([
        consultarTodas(() => supabase.from('proveedores')
          .select('id,nombre,contacto,telefono,correo')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase
          .from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja,proveedor_id')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
      ]);
      return {
        proveedores,
        productos,
      };
    },
  });
}

async function consultarPedidos() {
  const ordenes = await consultarTodas(() => supabase
    .from('ordenes_pedido')
    .select('id,numero,fecha,fecha_estimada,estado,motivo_cierre,proveedor_id,creado_por')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false }));
  if (ordenes.length === 0) return [];

  const ordenIds = ordenes.map((orden) => orden.id);
  const proveedorIds = [...new Set(ordenes.map((orden) => orden.proveedor_id).filter(Boolean))];
  const usuarioIds = [...new Set(ordenes.map((orden) => orden.creado_por).filter(Boolean))];
  const [bloquesProveedores, bloquesUsuarios, bloquesDetalles] = await Promise.all([
    Promise.all(dividirEnGrupos(proveedorIds).map((ids) => consultarTodas(() => supabase.from('proveedores')
      .select('id,nombre,contacto,telefono,correo')
      .in('id', ids)
      .order('id')))),
    Promise.all(dividirEnGrupos(usuarioIds).map((ids) => consultarTodas(() => supabase.from('v_usuarios_nombres_operativos')
      .select('id,nombre')
      .in('id', ids)
      .order('id')))),
    Promise.all(dividirEnGrupos(ordenIds).map((ids) => consultarTodas(() => supabase
      .from('detalle_orden_pedido')
      .select('id,orden_pedido_id,producto_id,cantidad,cantidad_recibida')
      .in('orden_pedido_id', ids)
      .order('id')))),
  ]);
  const proveedores = bloquesProveedores.flat();
  const usuarios = bloquesUsuarios.flat();
  const detalles = bloquesDetalles.flat();
  const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
  const bloquesProductos = await Promise.all(dividirEnGrupos(productoIds).map((ids) => consultarTodas(() => supabase
    .from('productos')
    .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
    .in('id', ids)
    .order('id'))));
  const productos = bloquesProductos.flat();

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
