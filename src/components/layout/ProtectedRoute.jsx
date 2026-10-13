import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth.js';
import { INICIO_POR_ROL } from '../../lib/roles.js';
import EmptyState from '../ui/EmptyState.jsx';

// Exige sesión iniciada y, si se indica, uno de los roles permitidos
export default function ProtectedRoute({ roles, children }) {
  const { sesion, perfil, cargando } = useAuth();
  const ubicacion = useLocation();

  if (cargando || (sesion && !perfil)) {
    return (
      <div className="pantalla-carga">
        <EmptyState loading title="Cargando…" />
      </div>
    );
  }
  if (!sesion) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (roles && !roles.includes(perfil.rol)) {
    return <Navigate to={INICIO_POR_ROL[perfil.rol] || '/stock'} replace />;
  }
  return children || <Outlet />;
}
