import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../context/useAuth.js';
import { INICIO_POR_ROL } from '../lib/roles.js';
import Icon from '../components/ui/Icon.jsx';
import Logo from '../components/ui/Logo.jsx';
import '../css/login.css';

const esquema = z.object({
  usuario: z.string().trim().min(1, 'Ingresa tu usuario.'),
  contrasena: z.string().min(1, 'Ingresa tu contraseña.'),
});

const AVISOS = {
  expirada: 'Tu sesión expiró por inactividad. Ingresa de nuevo.',
  inactiva: 'Tu cuenta está desactivada o no tiene perfil. Contacta al administrador.',
};

// P01 · Login (RF-40). No hay registro público: las cuentas las crea el administrador.
export default function Login() {
  const { perfil, iniciarSesion, aviso } = useAuth();
  const [error, setError] = useState(null);
  const [verContrasena, setVerContrasena] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(esquema), defaultValues: { usuario: '', contrasena: '' } });

  if (perfil) return <Navigate to={INICIO_POR_ROL[perfil.rol] || '/stock'} replace />;

  const enviar = async ({ usuario, contrasena }) => {
    setError(null);
    const mensaje = await iniciarSesion(usuario, contrasena);
    if (mensaje) setError(mensaje);
  };

  const mensajeAviso = !error && AVISOS[aviso];

  return (
    <div className="login">
      <aside className="login__panel" aria-hidden="true">
        <Logo claro />
        <div>
          <p className="login__lema">Cada caja registrada, cada salida respaldada.</p>
          <p>Existencias reales de bodega principal y minibodega, en tiempo real.</p>
        </div>
        <p>Pisos Buruca · San Miguel</p>
      </aside>

      <main className="login__main">
        <form className="login__form" onSubmit={handleSubmit(enviar)} noValidate>
          <header className="login__encabezado">
            <Logo />
            <h1>Iniciar sesión</h1>
            <p className="text-muted">Ingresa con el usuario que te asignó el administrador.</p>
          </header>

          {(error || mensajeAviso) && (
            <div className={`alert ${error ? 'alert--error' : 'alert--warning'}`} role="alert">
              <Icon name="alerta" size={18} />
              <span>{error || mensajeAviso}</span>
            </div>
          )}

          <div className="field">
            <label className="field__label" htmlFor="usuario">
              Usuario
            </label>
            <input
              id="usuario"
              className={`input${errors.usuario ? ' input--error' : ''}`}
              autoComplete="username"
              autoCapitalize="none"
              aria-invalid={Boolean(errors.usuario)}
              aria-describedby={errors.usuario ? 'usuario-error' : undefined}
              {...register('usuario')}
            />
            {errors.usuario && (
              <p className="field__error" id="usuario-error">
                <Icon name="alerta" size={14} /> {errors.usuario.message}
              </p>
            )}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="contrasena">
              Contraseña
            </label>
            <div className="input-group">
              <input
                id="contrasena"
                type={verContrasena ? 'text' : 'password'}
                className={`input${errors.contrasena ? ' input--error' : ''}`}
                autoComplete="current-password"
                aria-invalid={Boolean(errors.contrasena)}
                aria-describedby={errors.contrasena ? 'contrasena-error' : undefined}
                {...register('contrasena')}
              />
              <button
                type="button"
                className="input-group__action"
                onClick={() => setVerContrasena((v) => !v)}
                aria-label={verContrasena ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                <Icon name={verContrasena ? 'ojoOff' : 'ojo'} />
              </button>
            </div>
            {errors.contrasena && (
              <p className="field__error" id="contrasena-error">
                <Icon name="alerta" size={14} /> {errors.contrasena.message}
              </p>
            )}
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={isSubmitting}>
            {isSubmitting ? <span className="spinner" aria-hidden="true" /> : null}
            {isSubmitting ? 'Validando…' : 'Ingresar'}
          </button>

          <p className="login__ayuda">¿Olvidaste tu contraseña? Contacta al administrador.</p>
          <p className="login__pie">Sistema interno · Pisos Buruca</p>
        </form>
      </main>
    </div>
  );
}
