import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarTodas } from '../lib/consultarTodas.js';

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

function consultaBaseConteos() {
  return supabase
    .from('conteos')
    .select('id,fecha,alcance,categoria,ubicacion_id,estado,creado_por,documento_ajuste_id,documento_ajuste_negativo_id')
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
}

async function completarConteos(conteos) {
  if (conteos.length === 0) return [];

  const usuariosIds = [...new Set(conteos.map((conteo) => conteo.creado_por))];
  const ubicacionIds = [...new Set(conteos.map((conteo) => conteo.ubicacion_id))];
  const conteoIds = conteos.map((conteo) => conteo.id);
  const [usuariosResultado, ubicacionesResultado, detallesResultado] = await Promise.all([
    supabase.from('v_usuarios_nombres_operativos').select('id,nombre').in('id', usuariosIds),
    supabase.from('ubicaciones').select('id,nombre').in('id', ubicacionIds),
    supabase.from('detalle_conteo').select('id,conteo_id,producto_id,cantidad_sistema,cantidad_contada,diferencia').in('conteo_id', conteoIds).order('id'),
  ]);
  const usuarios = comprobar(usuariosResultado);
  const ubicaciones = comprobar(ubicacionesResultado);
  const detalles = comprobar(detallesResultado);
  const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
  const productos = productoIds.length
    ? comprobar(await supabase.from('productos').select('id,codigo,nombre,tipo,unidad,piezas_por_caja').in('id', productoIds))
    : [];
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

async function consultarConteosPendientes() {
  const conteos = await consultarTodas(() => consultaBaseConteos().eq('estado', 'pendiente'));
  return completarConteos(conteos);
}

export function useConteos() {
  return useQuery({ queryKey: ['conteos'], queryFn: consultarConteos });
}

export function useConteosPendientes() {
  return useQuery({ queryKey: ['conteos', 'pendientes'], queryFn: consultarConteosPendientes });
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
