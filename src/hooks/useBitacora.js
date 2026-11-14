import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

function limitesFecha(desde, hasta) {
  const fin = hasta ? new Date(`${hasta}T00:00:00-06:00`) : null;
  if (fin) fin.setUTCDate(fin.getUTCDate() + 1);
  return {
    inicio: desde ? new Date(`${desde}T00:00:00-06:00`).toISOString() : null,
    fin: fin?.toISOString() || null,
  };
}

export function useBitacora({ desde, hasta, tabla, accion, usuarioId, limite }) {
  return useQuery({
    queryKey: ['bitacora', { desde, hasta, tabla, accion, usuarioId, limite }],
    queryFn: async () => {
      const fechas = limitesFecha(desde, hasta);
      let consulta = supabase.from('bitacora')
        .select('id,usuario_id,fecha_hora,accion,tabla,registro_id,valor_anterior,valor_nuevo', { count: 'exact' })
        .order('fecha_hora', { ascending: false })
        .order('id', { ascending: false });
      if (fechas.inicio) consulta = consulta.gte('fecha_hora', fechas.inicio);
      if (fechas.fin) consulta = consulta.lt('fecha_hora', fechas.fin);
      if (tabla) consulta = consulta.eq('tabla', tabla);
      if (accion) consulta = consulta.eq('accion', accion);
      if (usuarioId) consulta = consulta.eq('usuario_id', usuarioId);
      const { data, error, count } = await consulta.range(0, limite - 1);
      if (error) throw error;
      const filas = data || [];
      const usuarioIds = [...new Set(filas.map((fila) => fila.usuario_id).filter(Boolean))];
      const usuarios = usuarioIds.length
        ? comprobar(await supabase.from('usuarios').select('id,nombre').in('id', usuarioIds))
        : [];
      const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
      return { filas: filas.map((fila) => ({ ...fila, usuario: porUsuario.get(fila.usuario_id) || 'Sistema/usuario no disponible' })), total: count || 0 };
    },
  });
}

export function useDocumentosAnulables() {
  return useQuery({
    queryKey: ['documentos-anulables'],
    queryFn: async () => {
      const documentos = comprobar(await supabase.from('documentos')
        .select('id,serie,anio,correlativo,tipo,fecha,motivo,retira_nombre,doc_venta_tipo,doc_venta_numero,traslado_confirmado_en')
        .eq('estado', 'aprobado')
        .not('tipo', 'in', '(anulacion,apertura_caja)')
        .order('fecha', { ascending: false })
        .limit(100));
      return documentos.map((documento) => ({
        ...documento,
        numero: `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`,
      }));
    },
  });
}

export function useUsuariosBitacora() {
  return useQuery({
    queryKey: ['usuarios-bitacora'],
    queryFn: async () => comprobar(await supabase.from('usuarios').select('id,nombre').order('nombre')),
  });
}

export function useAnularMovimiento() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }) => {
      const { data, error } = await supabase.rpc('anular_movimiento', {
        p_documento_id: id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bitacora'] }),
        queryClient.invalidateQueries({ queryKey: ['documentos-anulables'] }),
        queryClient.invalidateQueries({ queryKey: ['reportes'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });
}
