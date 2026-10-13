// Menú lateral agrupado (Operación, Control, Administración) y roles que ven cada opción
const TODOS = ['administrador', 'jefe_bodega', 'vendedora'];
const BODEGA = ['administrador', 'jefe_bodega'];
const ADMIN = ['administrador'];

export const MENU = [
  {
    grupo: 'Operación',
    items: [
      { ruta: '/inicio', texto: 'Inicio', icono: 'home', roles: BODEGA },
      { ruta: '/stock', texto: 'Consulta de stock', icono: 'search', roles: TODOS },
      { ruta: '/pedidos', texto: 'Pedidos a proveedor', icono: 'cart', roles: TODOS },
      { ruta: '/entradas', texto: 'Entradas', icono: 'entrada', roles: BODEGA },
      { ruta: '/salidas', texto: 'Salidas', icono: 'salida', roles: BODEGA },
      { ruta: '/traslados', texto: 'Traslados', icono: 'traslado', roles: BODEGA },
      { ruta: '/reservas', texto: 'Reservas', icono: 'reserva', roles: BODEGA },
      { ruta: '/conteos', texto: 'Conteos', icono: 'conteo', roles: BODEGA },
    ],
  },
  {
    grupo: 'Control',
    items: [
      {
        ruta: '/aprobaciones',
        texto: 'Aprobaciones',
        icono: 'aprobar',
        roles: ADMIN,
        contador: 'aprobaciones_pendientes',
      },
      { ruta: '/reportes', texto: 'Reportes', icono: 'reporte', roles: ADMIN },
      { ruta: '/bitacora', texto: 'Bitácora', icono: 'bitacora', roles: ADMIN },
    ],
  },
  {
    grupo: 'Administración',
    items: [
      { ruta: '/catalogo', texto: 'Catálogo', icono: 'catalogo', roles: ADMIN },
      { ruta: '/proveedores', texto: 'Proveedores', icono: 'proveedores', roles: ADMIN },
      { ruta: '/ubicaciones', texto: 'Ubicaciones', icono: 'ubicacion', roles: ADMIN },
      { ruta: '/usuarios', texto: 'Usuarios', icono: 'usuarios', roles: ADMIN },
    ],
  },
];

// Menú filtrado para un rol: oculta lo que no le corresponde
export function menuPorRol(rol) {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(rol)) })).filter(
    (g) => g.items.length > 0,
  );
}

// Todas las rutas con sus roles (para el enrutador)
export const RUTAS = MENU.flatMap((g) => g.items);
