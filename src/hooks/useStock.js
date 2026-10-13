import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

// Quita caracteres que alteran el filtro "or" de PostgREST
const limpiar = (texto) => texto.replace(/[%,()*]/g, ' ').trim();

// Stock consolidado (todas las ubicaciones) o de una ubicación (RF-36)
export function useStock({ busqueda, ubicacionId, categoria, soloBajoMinimo }) {
  return useQuery({
    queryKey: ['stock', { busqueda, ubicacionId, categoria, soloBajoMinimo }],
    queryFn: async () => {
      const porUbicacion = Boolean(ubicacionId);
      let consulta = supabase
        .from(porUbicacion ? 'v_stock' : 'v_stock_total')
        .select('*')
        .order('nombre')
        .limit(500);

      if (porUbicacion) consulta = consulta.eq('ubicacion_id', ubicacionId);
      if (categoria) consulta = consulta.eq('categoria', categoria);
      if (soloBajoMinimo && !porUbicacion) consulta = consulta.eq('bajo_minimo', true);
      const texto = limpiar(busqueda || '');
      if (texto) consulta = consulta.or(`codigo.ilike.%${texto}%,nombre.ilike.%${texto}%`);

      const { data, error } = await consulta;
      if (error) throw error;
      return data;
    },
  });
}

// Ubicaciones activas y categorías para los filtros
export function useFiltrosStock() {
  return useQuery({
    queryKey: ['filtros-stock'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [ubicaciones, productos] = await Promise.all([
        supabase.from('ubicaciones').select('id, nombre, vendible').eq('activa', true).order('id'),
        supabase.from('productos').select('categoria').eq('activo', true),
      ]);
      if (ubicaciones.error) throw ubicaciones.error;
      if (productos.error) throw productos.error;
      const categorias = [...new Set(productos.data.map((p) => p.categoria))].sort();
      return { ubicaciones: ubicaciones.data, categorias };
    },
  });
}

// Tiempo real (RNF-04): cualquier cambio en existencias o reservas refresca la consulta
export function useStockEnVivo() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel('stock-en-vivo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'existencias' }, () =>
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservas' }, () =>
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [queryClient]);
}
