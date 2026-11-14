import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarPorIds, consultarTodas } from '../lib/consultarTodas.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

export function useCatalogoConteos() {
  return useQuery({
    queryKey: ['catalogo-conteos'],
    queryFn: async () => {
      const [productos, ubicaciones] = await Promise.all([
        consultarTodas(() => supabase.from('productos')
          .select('id,codigo,nombre,tipo,categoria,unidad,piezas_por_caja')
          .eq('activo', true)
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id,nombre,tipo')
          .eq('activa', true)
          .order('nombre')
          .order('id')),
      ]);
      return { productos, ubicaciones, categorias: [...new Set(productos.map((producto) => producto.categoria))].sort() };
    },
  });
}

export function useStockConteo(ubicacionId) {
  return useQuery({
    queryKey: ['conteos', 'stock', ubicacionId],
    enabled: Boolean(ubicacionId),
    queryFn: () => consultarTodas(() => supabase
      .from('v_stock')
      .select('producto_id,fisico')
      .eq('ubicacion_id', ubicacionId)
      .order('nombre')
      .order('producto_id')),
  });
}

function consultaBaseConteos(opciones) {
  return supabase
    .from('conteos')
    .select('id,fecha,alcance,categoria,ubicacion_id,estado,creado_por,documento_ajuste_id,documento_ajuste_negativo_id', opciones)
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
}

async function completarConteos(conteos) {
  if (conteos.length === 0) return [];

  const usuariosIds = [...new Set(conteos.map((conteo) => conteo.creado_por))];
  const ubicacionIds = [...new Set(conteos.map((conteo) => conteo.ubicacion_id))];
  const conteoIds = conteos.map((conteo) => conteo.id);
  const [usuarios, ubicaciones, detalles] = await Promise.all([
    consultarPorIds(usuariosIds, (ids) => supabase.from('v_usuarios_nombres_operativos')
      .select('id,nombre')
      .in('id', ids)
      .order('id')),
    consultarPorIds(ubicacionIds, (ids) => supabase.from('ubicaciones')
      .select('id,nombre')
      .in('id', ids)
      .order('id')),
    consultarPorIds(conteoIds, (ids) => supabase.from('detalle_conteo')
      .select('id,conteo_id,producto_id,cantidad_sistema,cantidad_contada,diferencia')
      .in('conteo_id', ids)
      .order('id')),
  ]);
  const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
  const productos = await consultarPorIds(productoIds, (ids) => supabase.from('productos')
    .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
    .in('id', ids)
    .order('id'));
  const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
  const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
  const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
  const detallesPorConteo = new Map();
  for (const detalle of detalles) {
    const grupo = detallesPorConteo.get(detalle.conteo_id) || [];
    grupo.push({ ...detalle, producto: porProducto.get(detalle.producto_id) });
    detallesPorConteo.set(detalle.conteo_id, grupo);
  }
  return conteos.map((conteo) => ({
    ...conteo,
    creador: porUsuario.get(conteo.creado_por) || 'Usuario no disponible',
    ubicacion: porUbicacion.get(conteo.ubicacion_id) || 'Ubicación no disponible',
    detalles: detallesPorConteo.get(conteo.id) || [],
  }));
}

async function consultarConteos() {
  return completarConteos(comprobar(await consultaBaseConteos().limit(100)));
}

async function consultarConteosPendientes(pagina, tamanoPagina) {
  const desde = pagina * tamanoPagina;
  const hasta = desde + tamanoPagina - 1;
  const { data, error, count } = await consultaBaseConteos({ count: 'exact' })
    .eq('estado', 'pendiente')
    .range(desde, hasta);
  if (error) throw error;
  return {
    items: await completarConteos(data || []),
    total: count || 0,
  };
}

export function useConteos() {
  return useQuery({ queryKey: ['conteos'], queryFn: consultarConteos });
}

export function useConteosPendientes(pagina = 0, tamanoPagina = 15) {
  return useQuery({
    queryKey: ['conteos', 'pendientes', pagina, tamanoPagina],
    queryFn: () => consultarConteosPendientes(pagina, tamanoPagina),
  });
}

function useAccionConteo(nombreFuncion, alInvalidar) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (argumentos) => {
      const { data, error } = await supabase.rpc(nombreFuncion, argumentos);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conteos'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['aprobaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['reservas'] }),
      ]);
      alInvalidar?.();
    },
  });
}

export function useRegistrarConteo() {
  return useAccionConteo('registrar_conteo');
}

export function useAprobarConteo() {
  return useAccionConteo('aprobar_conteo');
}
