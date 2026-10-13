import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

async function consultar(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

export function usePendientes() {
  return useQuery({ queryKey: ['dashboard', 'pendientes'], queryFn: () => consultar(supabase.from('v_movimientos').select('id, numero, tipo, fecha, motivo, creado_por_nombre, estado').eq('estado', 'pendiente').order('fecha', { ascending: true }).limit(3)) });
}
export function useBajoMinimo() {
  return useQuery({ queryKey: ['dashboard', 'bajo-minimo'], queryFn: () => consultar(supabase.from('v_stock_total').select('producto_id, codigo, nombre, tipo, unidad, piezas_por_caja, disponible, stock_minimo').eq('bajo_minimo', true).order('disponible').limit(5)) });
}
export function useUltimosMovimientos() {
  return useQuery({ queryKey: ['dashboard', 'movimientos'], refetchInterval: 60_000, queryFn: () => consultar(supabase.from('v_movimientos').select('id, numero, tipo, fecha, estado, doc_venta_tipo, doc_venta_numero, creado_por_nombre').order('fecha', { ascending: false }).limit(5)) });
}
