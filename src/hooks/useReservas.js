import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarPorIds, consultarTodas } from '../lib/consultarTodas.js';

export function useCatalogoReservas() {
  return useQuery({
    queryKey: ['catalogo-reservas'],
    queryFn: async () => {
      const [productos, ubicaciones, vendedoras] = await Promise.all([
        consultarTodas(() => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id,nombre,tipo,vendible')
          .eq('activa', true)
          .eq('vendible', true)
          .in('tipo', ['bodega', 'minibodega'])
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('v_vendedoras_activas')
          .select('id,nombre')
          .order('nombre')
          .order('id')),
      ]);
      return {
        productos,
        ubicaciones,
        vendedoras,
      };
    },
  });
}

export function useStockReserva(ubicacionId) {
  return useQuery({
    queryKey: ['reservas', 'stock', ubicacionId],
    enabled: Boolean(ubicacionId),
    queryFn: () => consultarTodas(() => supabase
      .from('v_stock')
      .select('producto_id,fisico,reservado,disponible')
      .eq('ubicacion_id', ubicacionId)
      .order('producto_id')),
  });
}

async function consultarReservas() {
  const reservas = await consultarTodas(() => supabase
    .from('reservas')
    .select('id,producto_id,ubicacion_id,cantidad,vendedora_id,doc_venta_tipo,doc_venta_numero,estado,motivo_cancelacion,documento_id,creado_por,creado_en')
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false }));
  if (reservas.length === 0) return [];

  const usuarioIds = [...new Set(reservas.flatMap((reserva) => [reserva.vendedora_id, reserva.creado_por]).filter(Boolean))];
  const productoIds = [...new Set(reservas.map((reserva) => reserva.producto_id))];
  const ubicacionIds = [...new Set(reservas.map((reserva) => reserva.ubicacion_id))];
  const [usuarios, productos, ubicaciones] = await Promise.all([
    consultarPorIds(usuarioIds, (ids) => supabase.from('v_usuarios_nombres_operativos')
      .select('id,nombre')
      .in('id', ids)),
    consultarPorIds(productoIds, (ids) => supabase.from('productos')
      .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
      .in('id', ids)),
    consultarPorIds(ubicacionIds, (ids) => supabase.from('ubicaciones')
      .select('id,nombre')
      .in('id', ids)),
  ]);
  const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
  const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
  return reservas.map((reserva) => ({
    ...reserva,
    producto: porProducto.get(reserva.producto_id),
    ubicacion: porUbicacion.get(reserva.ubicacion_id),
    vendedora: porUsuario.get(reserva.vendedora_id) || 'Vendedora no disponible',
    creador: porUsuario.get(reserva.creado_por) || 'Usuario no disponible',
  }));
}

export function useReservas() {
  return useQuery({ queryKey: ['reservas'], queryFn: consultarReservas });
}

export function useCrearReserva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reserva) => {
      const { data: sesion, error: sesionError } = await supabase.auth.getUser();
      if (sesionError) throw sesionError;
      if (!sesion.user) throw new Error('La sesión expiró. Inicia sesión de nuevo.');
      const { data, error } = await supabase.from('reservas').insert({
        ...reserva,
        creado_por: sesion.user.id,
        estado: 'activa',
        documento_id: null,
      }).select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reservas'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}

export function useCancelarReserva() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }) => {
      const { error } = await supabase.rpc('cancelar_reserva', {
        p_reserva_id: id,
        p_motivo: motivo,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reservas'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}
