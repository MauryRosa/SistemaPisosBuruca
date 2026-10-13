// Íconos de línea simple (24×24, trazo). Siempre acompañan a un texto cuando comunican un estado.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  box: 'M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10',
  cart: 'M4 5h16l-2 9H6L4 5zM4 5L3 2H1M8 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01',
  entrada: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  salida: 'M12 21V9M7 14l5-5 5 5M4 5h16',
  traslado: 'M4 8h13l-3-3M20 16H7l3 3',
  reserva: 'M6 3h12v18l-6-4-6 4V3z',
  conteo: 'M9 4h6v3H9zM6 5H5v16h14V5h-1M8 12l2 2 4-4',
  aprobar: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  reporte: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bitacora: 'M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  catalogo: 'M3 3h7l11 11-7 7L3 10V3zM7 7h.01',
  proveedores: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01',
  ubicacion: 'M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12zM12 7a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  usuarios:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  alerta: 'M12 3L2 20h20L12 3zM12 10v4M12 17h.01',
  ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  ojoOff:
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  reloj: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  flecha: 'M5 12h14M13 6l6 6-6 6',
  filtro: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
};

export default function Icon({ name, size = 20, className, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name] || PATHS.box} />
    </svg>
  );
}
