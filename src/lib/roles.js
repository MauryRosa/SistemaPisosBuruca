export const ROLES = {
  administrador: 'Administrador',
  jefe_bodega: 'Jefe de bodega',
  vendedora: 'Vendedora',
};

export const INICIO_POR_ROL = {
  administrador: '/inicio',
  jefe_bodega: '/inicio',
  vendedora: '/stock',
};

export function nombreRol(rol) { return ROLES[rol] || rol; }
