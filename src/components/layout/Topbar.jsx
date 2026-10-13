import Icon from '../ui/Icon.jsx';
import { nombreRol } from '../../lib/roles.js';

// Barra superior: botón de menú (móvil), usuario con su rol y cerrar sesión
export default function Topbar({ perfil, onAbrirMenu, onCerrarSesion }) {
  return (
    <header className="topbar">
      <button type="button" className="topbar__menu" onClick={onAbrirMenu} aria-label="Abrir menú">
        <Icon name="menu" size={22} />
      </button>
      <div className="topbar__espacio" />
      <div className="topbar__usuario">
        <span className="topbar__avatar" aria-hidden="true">
          {perfil.nombre.charAt(0).toUpperCase()}
        </span>
        <span className="topbar__datos">
          <strong>{perfil.nombre}</strong>
          <small>{nombreRol(perfil.rol)}</small>
        </span>
      </div>
      <button type="button" className="btn btn--ghost" onClick={onCerrarSesion}>
        <Icon name="logout" size={18} />
        <span className="topbar__salir">Cerrar sesión</span>
      </button>
    </header>
  );
}
