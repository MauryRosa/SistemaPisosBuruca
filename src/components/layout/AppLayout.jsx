import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/useAuth.js';
import { useResumen } from '../../hooks/useResumen.js';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import '../../css/layout.css';

// P02 · Layout base: menú según el rol, barra superior y contenido
export default function AppLayout() {
  const { perfil, cerrarSesion } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { data: resumen } = useResumen({ habilitado: perfil.rol === 'administrador' });

  return (
    <div className="app">
      <Sidebar
        rol={perfil.rol}
        abierto={menuAbierto}
        onCerrar={() => setMenuAbierto(false)}
        contadores={resumen || {}}
      />
      <div className="app__columna">
        <Topbar
          perfil={perfil}
          onAbrirMenu={() => setMenuAbierto(true)}
          onCerrarSesion={cerrarSesion}
        />
        <main className="app__contenido" id="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
