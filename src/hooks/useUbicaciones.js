import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

async function consultarUbicaciones() {
  const { data: filas, error } = await supabase
    .from('ubicaciones')
    .select('id,nombre,tipo,vendible,activa')
    .order('nombre');
  if (error) throw error;

  return Promise.all(filas.map(async (ubicacion) => {
    const [existencias, reservas] = await Promise.all([
      supabase
        .from('existencias')
        .select('producto_id', { count: 'exact', head: true })
        .eq('ubicacion_id', ubicacion.id)
        .gt('cantidad', 0),
      supabase
        .from('reservas')
        .select('id', { count: 'exact', head: true })
        .eq('ubicacion_id', ubicacion.id)
        .eq('estado', 'activa'),
    ]);

    if (existencias.error) throw existencias.error;
    if (reservas.error) throw reservas.error;
    return {
      ...ubicacion,
      productosConSaldo: existencias.count || 0,
      reservasActivas: reservas.count || 0,
    };
  }));
}

export function useUbicaciones() {
  return useQuery({ queryKey: ['ubicaciones'], queryFn: consultarUbicaciones });
}

function useGuardarUbicacion(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ubicaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['filtros-stock'] }),
      ]);
    },
  });
}

export function useCrearUbicacion() {
  return useGuardarUbicacion(async (ubicacion) => {
    const { error } = await supabase.from('ubicaciones').insert(ubicacion);
    if (error) throw error;
  });
}

export function useRenombrarUbicacion() {
  return useGuardarUbicacion(async ({ id, nombre }) => {
    const { error } = await supabase
      .from('ubicaciones')
      .update({ nombre })
      .eq('id', id)
      .select('id')
      .single();
    if (error) throw error;
  });
}

export function useCambiarEstadoUbicacion() {
  return useGuardarUbicacion(async ({ id, activa }) => {
    const { error } = await supabase
      .from('ubicaciones')
      .update({ activa })
      .eq('id', id)
      .select('id')
      .single();
    if (error) throw error;
  });
}
