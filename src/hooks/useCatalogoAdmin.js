import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

export function useCatalogoAdmin() {
  return useQuery({
    queryKey: ['catalogo-admin'],
    queryFn: async () => {
      const [productosResultado, proveedoresResultado] = await Promise.all([
        supabase.from('productos')
          .select('id,codigo,nombre,tipo,categoria,medida,unidad,piezas_por_caja,despacho_por,stock_minimo,proveedor_id,activo')
          .order('nombre'),
        supabase.from('proveedores').select('id,nombre,activo').order('nombre'),
      ]);
      const productos = comprobar(productosResultado);
      const proveedores = comprobar(proveedoresResultado);
      const porProveedor = new Map(proveedores.map((proveedor) => [proveedor.id, proveedor]));
      return {
        productos: productos.map((producto) => ({ ...producto, proveedor: porProveedor.get(producto.proveedor_id) || null })),
        proveedores,
      };
    },
  });
}

function useInvalidarCatalogo() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['catalogo-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['catalogo-traslados'] }),
      queryClient.invalidateQueries({ queryKey: ['catalogo-salidas'] }),
      queryClient.invalidateQueries({ queryKey: ['catalogo-reservas'] }),
      queryClient.invalidateQueries({ queryKey: ['catalogo-conteos'] }),
      queryClient.invalidateQueries({ queryKey: ['catalogo-reportes'] }),
      queryClient.invalidateQueries({ queryKey: ['stock'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  };
}

export function useGuardarProducto() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async ({ id, producto }) => {
      const consulta = id
        ? supabase.from('productos').update(producto).eq('id', id)
        : supabase.from('productos').insert(producto);
      const { data, error } = await consulta.select('id').single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: invalidar,
  });
}

export function useCambiarEstadoProducto() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: async ({ id, activo }) => {
      const { data, error } = await supabase.from('productos')
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
