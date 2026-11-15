import { useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAuth } from '../context/useAuth.js';
import { useCambiarEstadoUsuario, useCrearUsuario, useUsuarios } from '../hooks/useUsuarios.js';
import { ROLES } from '../lib/roles.js';
import '../css/usuarios.css';

const VACIO = { nombre: '', usuario: '', rol: 'vendedora', contrasena: '' };

function fechaCorta(fecha) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium' }).format(new Date(fecha));
}

export default function Usuarios() {
  const { perfil } = useAuth();
  const [formulario, setFormulario] = useState(VACIO);
  const [mensaje, setMensaje] = useState(null);
  const lista = useUsuarios();
  const crear = useCrearUsuario();
  const cambiarEstado = useCambiarEstadoUsuario();
  const usuarios = lista.data || [];

  function cambiar(campo, valor) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function crearUsuario(event) {
    event.preventDefault();
    setMensaje(null);
    try {
      const creado = await crear.mutateAsync({
        nombre: formulario.nombre.trim(),
        usuario: formulario.usuario.trim().toLowerCase(),
        rol: formulario.rol,
        contrasena: formulario.contrasena,
      });
      setFormulario(VACIO);
      setMensaje({ tipo: 'exito', texto: `Cuenta ${creado.usuario} creada. La persona puede ingresar con el usuario y la contraseña inicial asignada.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.message || 'No se pudo crear el usuario.' });
    }
  }

  async function alternar(usuario) {
    setMensaje(null);
    try {
      await cambiarEstado.mutateAsync({ id: usuario.id, activo: !usuario.activo });
      setMensaje({ tipo: 'exito', texto: `Cuenta ${usuario.usuario} ${usuario.activo ? 'desactivada' : 'activada'}.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: error.code === 'P0001' ? error.message : 'No se pudo cambiar el estado de la cuenta.' });
    }
  }

  return (
    <section className="pagina usuarios">
      <header className="pagina__encabezado">
        <div>
          <h1>Usuarios</h1>
          <p>Administra las cuentas y los permisos por rol. No se pueden borrar usuarios.</p>
        </div>
        <StatusBadge estado="activo" texto={`${usuarios.filter((usuario) => usuario.activo).length} activos`} />
      </header>

      {mensaje && (
        <p className={`usuarios__mensaje usuarios__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      <form className="card usuarios__formulario" onSubmit={crearUsuario}>
        <div>
          <h2>Crear cuenta</h2>
          <p>La autenticación y la contraseña quedan bajo Supabase Auth; la clave de servicio solo se usa en la función del servidor.</p>
        </div>
        <div className="usuarios__campos">
          <label className="field">
            <span className="field__label">Nombre completo</span>
            <input className="input" required minLength="2" maxLength="120" value={formulario.nombre} onChange={(event) => cambiar('nombre', event.target.value)} disabled={crear.isPending} />
          </label>
          <label className="field">
            <span className="field__label">Usuario</span>
            <input
              className="input"
              required
              minLength="3"
              maxLength="30"
              pattern="[a-zA-Z0-9._-]+"
              autoCapitalize="none"
              value={formulario.usuario}
              onChange={(event) => cambiar('usuario', event.target.value)}
              disabled={crear.isPending}
              aria-describedby="usuarios-ayuda"
            />
            <span className="usuarios__ayuda" id="usuarios-ayuda">Sin correo. La persona ingresará con este nombre de usuario.</span>
          </label>
          <label className="field">
            <span className="field__label">Rol</span>
            <select className="input" value={formulario.rol} onChange={(event) => cambiar('rol', event.target.value)} disabled={crear.isPending}>
              {Object.entries(ROLES).map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Contraseña inicial</span>
            <input className="input" type="password" autoComplete="new-password" required minLength="12" maxLength="128" value={formulario.contrasena} onChange={(event) => cambiar('contrasena', event.target.value)} disabled={crear.isPending} />
            <span className="usuarios__ayuda">Mínimo 12 caracteres. No se guarda en el perfil.</span>
          </label>
        </div>
        <footer className="usuarios__acciones">
          <button className="btn btn--primary" type="submit" disabled={crear.isPending}>
            {crear.isPending ? 'Creando cuenta…' : 'Crear usuario'}
          </button>
        </footer>
      </form>

      <section className="usuarios__lista" aria-labelledby="usuarios-lista-titulo">
        <header>
          <div><h2 id="usuarios-lista-titulo">Cuentas registradas</h2><p>{usuarios.length} usuarios · activación reversible</p></div>
          <button className="btn btn--secondary" type="button" onClick={() => lista.refetch()} disabled={lista.isFetching}>Actualizar</button>
        </header>
        {lista.isLoading && <EmptyState loading title="Consultando cuentas…" />}
        {lista.isError && (
          <EmptyState icon="alerta" title="No se pudo cargar la lista de usuarios.">
            <button className="btn btn--secondary" type="button" onClick={() => lista.refetch()}>Reintentar</button>
          </EmptyState>
        )}
        {!lista.isLoading && !lista.isError && usuarios.length === 0 && <div className="card"><EmptyState title="No hay usuarios registrados." /></div>}
        {!lista.isLoading && !lista.isError && usuarios.length > 0 && (
          <div className="usuarios__tarjetas">
            {usuarios.map((usuario) => {
              const esActual = usuario.id === perfil?.id;
              return (
                <article className="card usuarios__tarjeta" key={usuario.id}>
                  <div>
                    <h3>{usuario.nombre}</h3>
                    <p>@{usuario.usuario}{esActual ? ' · Tu cuenta' : ''}</p>
                    <small>{ROLES[usuario.rol] || usuario.rol} · creado {fechaCorta(usuario.creado_en)}</small>
                  </div>
                  <StatusBadge estado={usuario.activo ? 'activo' : 'inactivo'} />
                  <button
                    type="button"
                    className={`btn ${usuario.activo ? 'btn--secondary' : 'btn--primary'}`}
                    onClick={() => alternar(usuario)}
                    disabled={cambiarEstado.isPending || esActual}
                    title={esActual ? 'No puedes desactivar tu propia cuenta.' : undefined}
                  >
                    {cambiarEstado.isPending && cambiarEstado.variables?.id === usuario.id
                      ? 'Guardando…'
                      : usuario.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
