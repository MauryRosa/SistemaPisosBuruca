import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

// Contadores del dashboard (aprobaciones, bajo mínimo, reservas y movimientos de hoy)
export function useResumen({ habilitado = true } = {}) {
  return useQuery({
    queryKey: ['resumen-dashboard'],
    enabled: habilitado,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('resumen_dashboard');
      if (error) throw error;
      return data;
    },
  });
}
