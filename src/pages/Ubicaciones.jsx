import { useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import Icon from '../components/ui/Icon.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import {
  useCambiarEstadoUbicacion,
  useCrearUbicacion,
  useRenombrarUbicacion,
  useUbicaciones,
} from '../hooks/useUbicaciones.js';
import '../css/ubicaciones.css';

const TIPOS = {
  bodega: 'Bodega principal',
  minibodega: 'Minibodega',
  exhibicion: 'Exhibición',
};

function explicarError(error) {
  if (error?.code === '23505') return 'Ya existe una ubicación con ese nombre.';
  if (error?.code === 'P0001') return error.message;
  return 'No se pudo guardar el cambio. Revisa tu conexión y vuelve a intentarlo.';
}

export default function Ubicaciones() {
  const { data: ubicaciones = [], isLoading, isError, refetch } = useUbicaciones();
  const crear = useCrearUbicacion();
  const renombrar = useRenombrarUbicacion();
  const cambiarEstado = useCambiarEstadoUbicacion();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('bodega');
  const [edicion, setEdicion] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const guardando = crear.isPending || renombrar.isPending || cambiarEstado.isPending;
  const activas = ubicaciones.filter((ubicacion) => ubicacion.activa).length;
  const productosConSaldo = ubicaciones.reduce(
    (total, ubicacion) => total + ubicacion.productosConSaldo,
    0,
  );

  async function guardarNueva(event) {
    event.preventDefault();
    setMensaje(null);
    try {
      await crear.mutateAsync({
        nombre: nombreNuevo.trim(),
        tipo: tipoNuevo,
        vendible: tipoNuevo !== 'exhibicion',
      });
      setNombreNuevo('');
      setTipoNuevo('bodega');
      setMostrarFormulario(false);
      setMensaje({ tipo: 'exito', texto: 'Ubicación creada.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function guardarNombre(event) {
    event.preventDefault();
    if (!edicion) return;
    setMensaje(null);
    try {
      await renombrar.mutateAsync({ id: edicion.id, nombre: edicion.nombre.trim() });
      setEdicion(null);
      setMensaje({ tipo: 'exito', texto: 'Nombre actualizado.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function alternarEstado(ubicacion) {
    setMensaje(null);
    try {
      await cambiarEstado.mutateAsync({ id: ubicacion.id, activa: !ubicacion.activa });
      setMensaje({
        tipo: 'exito',
        texto: ubicacion.activa ? 'Ubicación desactivada.' : 'Ubicación reactivada.',
      });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  return (
    <section className="pagina">
      <header className="pagina__encabezado ubicaciones__encabezado">
        <div>
          <h1>Ubicaciones</h1>
          <p>Administra bodegas y áreas de exhibición sin borrar el historial de inventario.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={mostrarFormulario}
          aria-controls="formulario-ubicacion"
          onClick={() => {
            setMostrarFormulario((visible) => !visible);
            setMensaje(null);
          }}
        >
          <Icon name={mostrarFormulario ? 'close' : 'ubicacion'} />
          {mostrarFormulario ? 'Cerrar formulario' : 'Nueva ubicación'}
        </button>
      </header>

      <div className="ubicaciones__resumen" aria-label="Resumen de ubicaciones">
        <article className="card ubicaciones__dato">
          <span className="ubicaciones__dato-valor">{activas}</span>
          <span className="ubicaciones__dato-etiqueta">Ubicaciones activas</span>
        </article>
        <article className="card ubicaciones__dato">
          <span className="ubicaciones__dato-valor">{productosConSaldo}</span>
          <span className="ubicaciones__dato-etiqueta">Saldos de producto asignados</span>
        </article>
      </div>

      {mensaje && (
        <p className={`ubicaciones__mensaje ubicaciones__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {mostrarFormulario && (
        <form id="formulario-ubicacion" className="card ubicaciones__formulario" onSubmit={guardarNueva}>
          <div className="ubicaciones__formulario-titulo">
            <h2>Agregar ubicación</h2>
            <p>Las ubicaciones de exhibición quedan fuera del saldo disponible para venta.</p>
          </div>
          <div className="ubicaciones__campos">
            <label className="field">
              <span className="field__label">Nombre</span>
              <input
                className="input"
                required
                maxLength={100}
                value={nombreNuevo}
                onChange={(event) => setNombreNuevo(event.target.value)}
                placeholder="Ej. Minibodega norte"
              />
            </label>
            <label className="field">
              <span className="field__label">Tipo</span>
              <select
                className="input"
                value={tipoNuevo}
                onChange={(event) => setTipoNuevo(event.target.value)}
              >
                {Object.entries(TIPOS).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>{etiqueta}</option>
                ))}
              </select>
            </label>
            <div className="ubicaciones__vendible" aria-live="polite">
              <span className="field__label">Disponible para venta</span>
              <strong>{tipoNuevo === 'exhibicion' ? 'No' : 'Sí'}</strong>
            </div>
          </div>
          <div className="ubicaciones__acciones-formulario">
            <button className="btn btn--primary" type="submit" disabled={guardando || !nombreNuevo.trim()}>
              {crear.isPending ? 'Guardando…' : 'Guardar ubicación'}
            </button>
          </div>
        </form>
      )}

      <div className="card ubicaciones__tabla-card">
        <div className="card__header">
          <div>
            <h2>Ubicaciones registradas</h2>
            <p className="ubicaciones__ayuda">Desactiva solo áreas sin existencias, reservas ni movimientos pendientes.</p>
          </div>
          <span className="ubicaciones__contador">{ubicaciones.length}</span>
        </div>

        {isLoading && <EmptyState loading title="Consultando ubicaciones…" />}
        {isError && (
          <EmptyState icon="alerta" title="No se pudieron cargar las ubicaciones.">
            <button type="button" className="btn btn--secondary" onClick={() => refetch()}>
              Reintentar
            </button>
          </EmptyState>
        )}
        {!isLoading && !isError && ubicaciones.length === 0 && (
          <EmptyState icon="ubicacion" title="Todavía no hay ubicaciones registradas." />
        )}

        {!isLoading && !isError && ubicaciones.length > 0 && (
          <div className="tabla-scroll">
            <table className="table table--stack ubicaciones__tabla">
              <thead>
                <tr>
                  <th scope="col">Ubicación</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Productos con saldo</th>
                  <th scope="col">Reservas activas</th>
                  <th scope="col">Venta</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {ubicaciones.map((ubicacion) => {
                  const tieneSaldo = ubicacion.productosConSaldo > 0 || ubicacion.reservasActivas > 0;
                  const editando = edicion?.id === ubicacion.id;
                  return (
                    <tr key={ubicacion.id}>
                      <td data-label="Ubicación">
                        {editando ? (
                          <form className="ubicaciones__edicion" onSubmit={guardarNombre}>
                            <label className="sr-only" htmlFor={`nombre-${ubicacion.id}`}>Nombre de la ubicación</label>
                            <input
                              id={`nombre-${ubicacion.id}`}
                              className="input"
                              required
                              maxLength={100}
                              value={edicion.nombre}
                              onChange={(event) => setEdicion({ ...edicion, nombre: event.target.value })}
                            />
                            <button className="btn btn--primary" type="submit" disabled={guardando || !edicion.nombre.trim()}>
                              Guardar
                            </button>
                            <button className="btn btn--secondary" type="button" onClick={() => setEdicion(null)}>
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <strong>{ubicacion.nombre}</strong>
                        )}
                      </td>
                      <td data-label="Tipo">{TIPOS[ubicacion.tipo] || ubicacion.tipo}</td>
                      <td data-label="Productos con saldo" className="num">{ubicacion.productosConSaldo}</td>
                      <td data-label="Reservas activas" className="num">{ubicacion.reservasActivas}</td>
                      <td data-label="Venta">{ubicacion.vendible ? 'Sí' : 'No'}</td>
                      <td data-label="Estado"><StatusBadge estado={ubicacion.activa ? 'activo' : 'inactivo'} /></td>
                      <td data-label="Acciones" className="ubicaciones__acciones">
                        {!editando && (
                          <>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              aria-label={`Cambiar nombre de ${ubicacion.nombre}`}
                              disabled={guardando}
                              onClick={() => {
                                setEdicion({ id: ubicacion.id, nombre: ubicacion.nombre });
                                setMensaje(null);
                              }}
                            >
                              Cambiar nombre
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary"
                              disabled={guardando || (ubicacion.activa && tieneSaldo)}
                              title={ubicacion.activa && tieneSaldo ? 'Traslada o libera el saldo antes de desactivar.' : undefined}
                              onClick={() => alternarEstado(ubicacion)}
                            >
                              {ubicacion.activa ? 'Desactivar' : 'Reactivar'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
