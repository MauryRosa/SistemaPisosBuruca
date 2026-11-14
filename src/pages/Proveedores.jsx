import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '../lib/supabase.js';
import { consultarTodas } from '../lib/consultarTodas.js';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import '../css/proveedores.css';

const PROVEEDOR_VACIO = { nombre: '', contacto: '', telefono: '', correo: '' };

const esquemaProveedor = z.object({
  nombre: z.string().trim().min(1, 'Ingresa el nombre del proveedor.'),
  contacto: z.string().trim(),
  telefono: z.string().trim(),
  correo: z
    .string()
    .trim()
    .refine(
      (correo) => !correo || z.string().email().safeParse(correo).success,
      'Ingresa un correo válido.',
    ),
});

function errorProveedor(error) {
  if (error?.code === '42501') return 'No tienes permiso para modificar proveedores.';
  return 'No se pudo guardar el proveedor. Revisa los datos e inténtalo de nuevo.';
}

function camposDe(proveedor) {
  if (!proveedor) return PROVEEDOR_VACIO;
  return {
    nombre: proveedor.nombre,
    contacto: proveedor.contacto || '',
    telefono: proveedor.telefono || '',
    correo: proveedor.correo || '',
  };
}

export default function Proveedores() {
  const queryClient = useQueryClient();
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('activos');
  const [proveedorEditado, setProveedorEditado] = useState(null);
  const [campos, setCampos] = useState(PROVEEDOR_VACIO);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [mensajeError, setMensajeError] = useState(null);
  const busquedaDiferida = useDeferredValue(busqueda.trim().toLocaleLowerCase('es-SV'));

  const consulta = useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      return consultarTodas(() => supabase
        .from('proveedores')
        .select('id, nombre, contacto, telefono, correo, activo')
        .order('nombre')
        .order('id'));
    },
  });

  const guardar = useMutation({
    mutationFn: async ({ id, proveedor }) => {
      const operacion = id
        ? supabase.from('proveedores').update(proveedor).eq('id', id)
        : supabase.from('proveedores').insert(proveedor);
      const { data, error } = await operacion.select('id').maybeSingle();
      if (error) throw error;
      if (!data)
        throw Object.assign(new Error('La operación no modificó filas.'), { code: '42501' });
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
        queryClient.invalidateQueries({ queryKey: ['catalogo-productos'] }),
      ]);
      cerrarFormulario();
      setMensaje(variables.id ? 'Proveedor actualizado.' : 'Proveedor agregado.');
    },
    onError: (error) => setMensajeError(errorProveedor(error)),
  });

  const cambiarEstado = useMutation({
    mutationFn: async (proveedor) => {
      const { data, error } = await supabase
        .from('proveedores')
        .update({ activo: !proveedor.activo })
        .eq('id', proveedor.id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data)
        throw Object.assign(new Error('La operación no modificó filas.'), { code: '42501' });
    },
    onSuccess: async (_, proveedor) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
        queryClient.invalidateQueries({ queryKey: ['catalogo-productos'] }),
      ]);
      setMensaje(proveedor.activo ? 'Proveedor desactivado.' : 'Proveedor activado.');
      setMensajeError(null);
    },
    onError: (error) => setMensajeError(errorProveedor(error)),
  });

  const proveedores = useMemo(() => {
    return (consulta.data || []).filter((proveedor) => {
      if (filtroEstado === 'activos' && !proveedor.activo) return false;
      if (filtroEstado === 'inactivos' && proveedor.activo) return false;
      const texto = [proveedor.nombre, proveedor.contacto, proveedor.telefono, proveedor.correo]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-SV');
      return !busquedaDiferida || texto.includes(busquedaDiferida);
    });
  }, [consulta.data, filtroEstado, busquedaDiferida]);

  function cerrarFormulario() {
    setProveedorEditado(null);
    setCampos(PROVEEDOR_VACIO);
    setErrores({});
    setMensajeError(null);
  }

  function abrirFormulario(proveedor = null) {
    setProveedorEditado(proveedor ? { id: proveedor.id } : {});
    setCampos(camposDe(proveedor));
    setErrores({});
    setMensaje(null);
    setMensajeError(null);
  }

  function cambiarCampo(evento) {
    const { name, value } = evento.target;
    setCampos((anteriores) => ({ ...anteriores, [name]: value }));
    setErrores((anteriores) => ({ ...anteriores, [name]: null }));
  }

  function enviar(evento) {
    evento.preventDefault();
    setMensaje(null);
    setMensajeError(null);
    const resultado = esquemaProveedor.safeParse(campos);
    if (!resultado.success) {
      setErrores(
        Object.fromEntries(resultado.error.issues.map((issue) => [issue.path[0], issue.message])),
      );
      return;
    }
    setErrores({});
    const proveedor = Object.fromEntries(
      Object.entries(resultado.data).map(([clave, valor]) => [clave, valor || null]),
    );
    guardar.mutate({ id: proveedorEditado.id || null, proveedor });
  }

  return (
    <section className="pagina">
      <header className="pagina__encabezado">
        <div>
          <h1>Proveedores</h1>
          <p>Administra los contactos que surten productos al inventario.</p>
        </div>
        {!proveedorEditado && (
          <button type="button" className="btn btn--primary" onClick={() => abrirFormulario()}>
            Agregar proveedor
          </button>
        )}
      </header>

      {mensaje && (
        <div className="alert alert--success" role="status">
          {mensaje}
        </div>
      )}
      {mensajeError && (
        <div className="alert alert--error" role="alert">
          {mensajeError}
        </div>
      )}

      {proveedorEditado && (
        <form className="card proveedores-formulario" onSubmit={enviar} noValidate>
          <header className="card__header">
            <h2>{proveedorEditado.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={cerrarFormulario}
              disabled={guardar.isPending}
            >
              Cancelar
            </button>
          </header>
          <div className="proveedores-formulario__campos">
            <label className="field">
              <span className="field__label">
                Nombre <span aria-hidden="true">*</span>
              </span>
              <input
                className={`input${errores.nombre ? ' input--error' : ''}`}
                name="nombre"
                value={campos.nombre}
                onChange={cambiarCampo}
                required
                aria-invalid={Boolean(errores.nombre)}
                aria-describedby={errores.nombre ? 'proveedor-error-nombre' : undefined}
              />
              {errores.nombre && (
                <span className="field__error" id="proveedor-error-nombre">
                  {errores.nombre}
                </span>
              )}
            </label>
            <label className="field">
              <span className="field__label">Persona de contacto</span>
              <input
                name="contacto"
                className="input"
                value={campos.contacto}
                onChange={cambiarCampo}
              />
            </label>
            <label className="field">
              <span className="field__label">Teléfono</span>
              <input
                name="telefono"
                className="input"
                type="tel"
                autoComplete="tel"
                value={campos.telefono}
                onChange={cambiarCampo}
              />
            </label>
            <label className="field">
              <span className="field__label">Correo</span>
              <input
                name="correo"
                className={`input${errores.correo ? ' input--error' : ''}`}
                type="email"
                autoComplete="email"
                value={campos.correo}
                onChange={cambiarCampo}
                aria-invalid={Boolean(errores.correo)}
                aria-describedby={errores.correo ? 'proveedor-error-correo' : undefined}
              />
              {errores.correo && (
                <span className="field__error" id="proveedor-error-correo">
                  {errores.correo}
                </span>
              )}
            </label>
          </div>
          <footer className="proveedores-formulario__acciones">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={cerrarFormulario}
              disabled={guardar.isPending}
            >
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary" disabled={guardar.isPending}>
              {guardar.isPending
                ? 'Guardando…'
                : proveedorEditado.id
                  ? 'Guardar cambios'
                  : 'Agregar proveedor'}
            </button>
          </footer>
        </form>
      )}

      <div className="proveedores-filtros" role="search">
        <label className="field">
          <span className="sr-only">Buscar proveedores</span>
          <input
            className="input"
            type="search"
            placeholder="Buscar por nombre o contacto"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
          />
        </label>
        <label className="field">
          <span className="sr-only">Estado de los proveedores</span>
          <select
            className="input"
            value={filtroEstado}
            onChange={(evento) => setFiltroEstado(evento.target.value)}
          >
            <option value="activos">Proveedores activos</option>
            <option value="inactivos">Proveedores inactivos</option>
            <option value="todos">Todos los proveedores</option>
          </select>
        </label>
      </div>

      <section className="card" aria-label="Lista de proveedores">
        <div className="proveedores__resumen">
          {consulta.isLoading
            ? 'Cargando proveedores…'
            : `${proveedores.length} proveedor${proveedores.length === 1 ? '' : 'es'}`}
        </div>
        {consulta.isLoading && <EmptyState loading title="Cargando proveedores…" />}
        {consulta.isError && (
          <EmptyState icon="alerta" title="No se pudieron cargar los proveedores.">
            <button type="button" className="btn btn--secondary" onClick={() => consulta.refetch()}>
              Reintentar
            </button>
          </EmptyState>
        )}
        {!consulta.isLoading && !consulta.isError && proveedores.length === 0 && (
          <EmptyState
            icon="search"
            title={
              consulta.data?.length
                ? 'No hay proveedores que coincidan con los filtros.'
                : 'Todavía no hay proveedores registrados.'
            }
          >
            {!consulta.data?.length && (
              <button type="button" className="btn btn--primary" onClick={() => abrirFormulario()}>
                Agregar primer proveedor
              </button>
            )}
          </EmptyState>
        )}
        {!consulta.isLoading && !consulta.isError && proveedores.length > 0 && (
          <div className="tabla-scroll">
            <table className="table table--stack proveedores-tabla">
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Contacto</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Correo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((proveedor) => (
                  <tr key={proveedor.id}>
                    <td data-label="Proveedor" className="producto__nombre">
                      {proveedor.nombre}
                    </td>
                    <td data-label="Contacto">{proveedor.contacto || '—'}</td>
                    <td data-label="Teléfono">{proveedor.telefono || '—'}</td>
                    <td data-label="Correo">{proveedor.correo || '—'}</td>
                    <td data-label="Estado">
                      <StatusBadge estado={proveedor.activo ? 'activo' : 'inactivo'} />
                    </td>
                    <td data-label="Acciones" className="proveedores-tabla__acciones">
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={() => abrirFormulario(proveedor)}
                        disabled={guardar.isPending || cambiarEstado.isPending}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          setMensaje(null);
                          setMensajeError(null);
                          cambiarEstado.mutate(proveedor);
                        }}
                        disabled={guardar.isPending || cambiarEstado.isPending}
                      >
                        {proveedor.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
