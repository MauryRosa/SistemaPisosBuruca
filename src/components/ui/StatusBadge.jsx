import Icon from './Icon.jsx';

// Etiqueta de estado: color + ícono + texto (nunca solo color)
const ESTADOS = {
  pendiente: { texto: 'Pendiente', icono: 'reloj' },
  aprobado: { texto: 'Aprobado', icono: 'check' },
  rechazado: { texto: 'Rechazado', icono: 'x' },
  anulado: { texto: 'Anulado', icono: 'x' },
  activo: { texto: 'Activo', icono: 'check' },
  inactivo: { texto: 'Inactivo', icono: 'x' },
  'bajo-minimo': { texto: 'Bajo mínimo', icono: 'alerta' },
  activa: { texto: 'Activa', icono: 'check' },
  consumida: { texto: 'Consumida', icono: 'check' },
  cancelada: { texto: 'Cancelada', icono: 'x' },
};

export default function StatusBadge({ estado, texto }) {
  const info = ESTADOS[estado] || { texto: estado, icono: 'reloj' };
  const clase = estado === 'activa' ? 'activo' : estado;
  return (
    <span className={`badge badge--${clase}`}>
      <Icon name={info.icono} size={14} />
      {texto || info.texto}
    </span>
  );
}
