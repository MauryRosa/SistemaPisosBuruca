import { NavLink } from 'react-router-dom';
import Icon from '../ui/Icon.jsx';
import Logo from '../ui/Logo.jsx';
import { menuPorRol } from '../../config/menu.js';

// Menú lateral: expandido en escritorio, solo íconos en tableta y cajón en móvil
export default function Sidebar({ rol, abierto, onCerrar, contadores = {} }) {
  const grupos = menuPorRol(rol);

  return (
    <>
      <div
        className={`sidebar-fondo${abierto ? ' es-visible' : ''}`}
        onClick={onCerrar}
        aria-hidden="true"
      />
      <aside className={`sidebar${abierto ? ' es-abierto' : ''}`} aria-label="Menú principal">
        <div className="sidebar__encabezado">
          <Logo claro subtitulo={null} />
          <button
            type="button"
            className="sidebar__cerrar"
            onClick={onCerrar}
            aria-label="Cerrar menú"
          >
            <Icon name="close" />
          </button>
        </div>

        <nav className="sidebar__nav">
          {grupos.map((g) => (
            <div key={g.grupo} className="sidebar__grupo">
              <p className="sidebar__titulo">{g.grupo}</p>
              <ul role="list">
                {g.items.map((item) => {
                  const contador = item.contador ? contadores[item.contador] : 0;
                  return (
                    <li key={item.ruta}>
                      <NavLink
                        to={item.ruta}
                        className="sidebar__enlace"
                        title={item.texto}
                        onClick={onCerrar}
                      >
                        <Icon name={item.icono} />
                        <span className="sidebar__texto">{item.texto}</span>
                        {contador > 0 && (
                          <span className="sidebar__contador" aria-label={`${contador} pendientes`}>
                            {contador}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
