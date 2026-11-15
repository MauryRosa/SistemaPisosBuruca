import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

export function useUsuarios() {
  return useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('usuarios')
        .select('id,nombre,usuario,rol,activo,creado_en')
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });
}

function useInvalidarUsuarios() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
      queryClient.invalidateQueries({ queryKey: ['usuarios-bitacora'] }),
    ]);
  };
}

export function useCrearUsuario() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: async (usuario) => {
      const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: usuario });
      if (error) {
        let mensaje = 'No se pudo crear el usuario.';
        try {
          const respuesta = await error.context?.json();
          if (respuesta?.error) mensaje = respuesta.error;
        } catch {
          // Se conserva el mensaje seguro cuando la respuesta no trae JSON.
        }
        throw new Error(mensaje);
      }
      return data;
    },
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoUsuario() {
  const invalidar = useInvalidarUsuarios();
  return useMutation({
    mutationFn: async ({ id, activo }) => {
      const { data, error } = await supabase.from('usuarios')
        .update({ activo })
        .eq('id', id)
        .select('id,activo')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidar,
  });
}
