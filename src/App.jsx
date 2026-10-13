import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import EnConstruccion from './pages/EnConstruccion.jsx';
import { RUTAS } from './config/menu.js';
import { useAuth } from './context/useAuth.js';
import { INICIO_POR_ROL } from './lib/roles.js';

// Pantallas ya implementadas; el resto muestra "En construcción"
const PANTALLAS = {};

function InicioSegunRol() {
  const { perfil } = useAuth();
  return <Navigate to={INICIO_POR_ROL[perfil?.rol] || '/stock'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<InicioSegunRol />} />
          {RUTAS.map(({ ruta, texto, roles }) => {
            const Pantalla = PANTALLAS[ruta];
            return (
              <Route
                key={ruta}
                path={ruta}
                element={
                  <ProtectedRoute roles={roles}>
                    {Pantalla ? <Pantalla /> : <EnConstruccion titulo={texto} />}
                  </ProtectedRoute>
                }
              />
            );
          })}
          <Route path="*" element={<InicioSegunRol />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
