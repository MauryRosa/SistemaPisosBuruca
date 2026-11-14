import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import AppLayout from './components/layout/AppLayout.jsx';
import Login from './pages/Login.jsx';
import EnConstruccion from './pages/EnConstruccion.jsx';
import { RUTAS } from './config/menu.js';
import { useAuth } from './context/useAuth.js';
import { INICIO_POR_ROL } from './lib/roles.js';

const ConsultaStock = lazy(() => import('./pages/ConsultaStock.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Pedidos = lazy(() => import('./pages/Pedidos.jsx'));
const Proveedores = lazy(() => import('./pages/Proveedores.jsx'));
const Ubicaciones = lazy(() => import('./pages/Ubicaciones.jsx'));
const Aprobaciones = lazy(() => import('./pages/Aprobaciones.jsx'));
const Entradas = lazy(() => import('./pages/Entradas.jsx'));
const Traslados = lazy(() => import('./pages/Traslados.jsx'));
const Salidas = lazy(() => import('./pages/Salidas.jsx'));
const Reservas = lazy(() => import('./pages/Reservas.jsx'));
const Conteos = lazy(() => import('./pages/Conteos.jsx'));
const Reportes = lazy(() => import('./pages/Reportes.jsx'));
const Bitacora = lazy(() => import('./pages/Bitacora.jsx'));
const Usuarios = lazy(() => import('./pages/Usuarios.jsx'));
const Catalogo = lazy(() => import('./pages/Catalogo.jsx'));
const DetalleProducto = lazy(() => import('./pages/DetalleProducto.jsx'));

// Pantallas ya implementadas; el resto muestra "En construcción"
const PANTALLAS = {
  '/inicio': Dashboard,
  '/stock': ConsultaStock,
  '/pedidos': Pedidos,
  '/aprobaciones': Aprobaciones,
  '/entradas': Entradas,
  '/traslados': Traslados,
  '/salidas': Salidas,
  '/reservas': Reservas,
  '/conteos': Conteos,
  '/reportes': Reportes,
  '/bitacora': Bitacora,
  '/usuarios': Usuarios,
  '/catalogo': Catalogo,
  '/proveedores': Proveedores,
  '/ubicaciones': Ubicaciones,
};

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
          <Route
            path="/producto/:productoId"
            element={(
              <ProtectedRoute roles={['administrador', 'jefe_bodega', 'vendedora']}>
                <Suspense fallback={<main className="pagina" role="status" aria-live="polite">Cargando pantalla…</main>}>
                  <DetalleProducto />
                </Suspense>
              </ProtectedRoute>
            )}
          />
          {RUTAS.map(({ ruta, texto, roles }) => {
            const Pantalla = PANTALLAS[ruta];
            return (
              <Route
                key={ruta}
                path={ruta}
                element={
                  <ProtectedRoute roles={roles}>
                    {Pantalla ? (
                      <Suspense fallback={<main className="pagina" role="status" aria-live="polite">Cargando pantalla…</main>}>
                        <Pantalla />
                      </Suspense>
                    ) : <EnConstruccion titulo={texto} />}
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
