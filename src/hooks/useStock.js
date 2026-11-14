import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

// Quita caracteres que alteran el filtro "or" de PostgREST
const limpiar = (texto) => texto.replace(/[%,()*]/g, ' ').trim();
const TAMANO_PAGINA_STOCK = 100;
const TAMANO_PAGINA_FILTROS = 500;

async function consultarTodas(crearConsulta) {
  const resultados = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA_FILTROS) {
    const { data, error } = await crearConsulta().range(desde, desde + TAMANO_PAGINA_FILTROS - 1);
    if (error) throw error;
    const pagina = data || [];
    resultados.push(...pagina);
    if (pagina.length < TAMANO_PAGINA_FILTROS) return resultados;
  }
}

// Stock consolidado (todas las ubicaciones) o de una ubicación (RF-36)
export function useStock({ busqueda, ubicacionId, categoria, soloBajoMinimo, pagina = 0 }) {
  return useQuery({
    queryKey: ['stock', { busqueda, ubicacionId, categoria, soloBajoMinimo, pagina }],
    queryFn: async () => {
      const porUbicacion = Boolean(ubicacionId);
      let consulta = supabase
        .from(porUbicacion ? 'v_stock' : 'v_stock_total')
        .select('*')
        .order('nombre')
        .order('producto_id');

      if (porUbicacion) consulta = consulta.eq('ubicacion_id', ubicacionId);
      if (categoria) consulta = consulta.eq('categoria', categoria);
      if (soloBajoMinimo && !porUbicacion) consulta = consulta.eq('bajo_minimo', true);
      const texto = limpiar(busqueda || '');
      if (texto) consulta = consulta.or(`codigo.ilike.%${texto}%,nombre.ilike.%${texto}%`);

      const inicio = pagina * TAMANO_PAGINA_STOCK;
      const { data, error } = await consulta.range(inicio, inicio + TAMANO_PAGINA_STOCK);
      if (error) throw error;
      const filas = data || [];
      return {
        filas: filas.slice(0, TAMANO_PAGINA_STOCK),
        haySiguiente: filas.length > TAMANO_PAGINA_STOCK,
      };
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
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id, nombre, vendible')
          .eq('activa', true)
          .order('id')),
        consultarTodas(() => supabase.from('productos')
          .select('categoria')
          .eq('activo', true)
          .order('id')),
      ]);
      const categorias = [...new Set(productos.map((p) => p.categoria))].sort();
      return { ubicaciones, categorias };
    },
  });
}

// Tiempo real (RNF-04): las reservas solo notifican una invalidación sin filas.
export function useStockEnVivo() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const canal = supabase
      .channel('stock:invalidacion', { config: { private: true } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'existencias' }, () =>
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      )
      .on('broadcast', { event: 'stock_invalidado' }, () =>
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [queryClient]);
}
