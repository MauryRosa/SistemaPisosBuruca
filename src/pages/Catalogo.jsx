import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useCambiarEstadoProducto, useCatalogoAdmin, useGuardarProducto } from '../hooks/useCatalogoAdmin.js';
import { formatoStock } from '../lib/unidades.js';
import '../css/catalogo.css';

const VACIO = {
  codigo: '', nombre: '', tipo: 'piso', categoria: '', medida: '', unidad: 'pieza',
  piezas_por_caja: '', despacho_por: 'ambos', stock_minimo: '0', proveedor_id: '',
};
const UNIDADES = [
  ['pieza', 'Pieza'],
  ['bolsa', 'Bolsa'],
  ['unidad', 'Unidad'],
  ['paquete', 'Paquete'],
  ['galon', 'Galón'],
];
const SIN_PRODUCTOS = [];

function mensajeError(error) {
  if (error?.code === 'P0001') return error.message;
  if (error?.code === '23505') return 'Ese código de producto ya existe.';
  return 'No se pudo guardar el producto. Revisa los campos e inténtalo de nuevo.';
}

export default function Catalogo() {
  const [formulario, setFormulario] = useState(VACIO);
  const [productoEditando, setProductoEditando] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('activos');
  const [mensaje, setMensaje] = useState(null);
  const consulta = useCatalogoAdmin();
  const guardar = useGuardarProducto();
  const cambiarEstado = useCambiarEstadoProducto();
  const productos = consulta.data?.productos || SIN_PRODUCTOS;
  const proveedores = consulta.data?.proveedores || [];
  const productosVisibles = useMemo(() => productos.filter((producto) => {
    const coincideEstado = estadoFiltro === 'todos' || (estadoFiltro === 'activos' ? producto.activo : !producto.activo);
    const texto = `${producto.codigo} ${producto.nombre} ${producto.categoria}`.toLocaleLowerCase('es');
    return coincideEstado && texto.includes(busqueda.trim().toLocaleLowerCase('es'));
  }), [productos, estadoFiltro, busqueda]);

  function cambiar(campo, valor) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  function editar(producto) {
    setProductoEditando(producto);
    setFormulario({
      codigo: producto.codigo,
      nombre: producto.nombre,
      tipo: producto.tipo,
      categoria: producto.categoria,
      medida: producto.medida || '',
      unidad: producto.unidad,
      piezas_por_caja: producto.piezas_por_caja || '',
      despacho_por: producto.despacho_por,
      stock_minimo: producto.stock_minimo,
      proveedor_id: producto.proveedor_id || '',
    });
    setMensaje(null);
    document.getElementById('catalogo-formulario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function limpiar() {
    setFormulario(VACIO);
    setProductoEditando(null);
  }

  const pisoValido = formulario.tipo !== 'piso'
    || (Number.isInteger(Number(formulario.piezas_por_caja)) && Number(formulario.piezas_por_caja) > 0);
  const minimoValido = Number.isInteger(Number(formulario.stock_minimo)) && Number(formulario.stock_minimo) >= 0;
  const valido = Boolean(formulario.codigo.trim() && formulario.nombre.trim() && formulario.categoria.trim() && formulario.proveedor_id)
    && pisoValido && minimoValido;

  async function guardarProducto(event) {
    event.preventDefault();
    if (!valido) return;
    setMensaje(null);
    const esPiso = formulario.tipo === 'piso';
    const producto = {
      codigo: formulario.codigo.trim().toUpperCase(),
      nombre: formulario.nombre.trim(),
      tipo: formulario.tipo,
      categoria: formulario.categoria.trim(),
      medida: formulario.medida.trim() || null,
      unidad: esPiso ? 'pieza' : formulario.unidad,
      piezas_por_caja: esPiso ? Number(formulario.piezas_por_caja) : null,
      despacho_por: esPiso ? formulario.despacho_por : 'pieza',
      stock_minimo: Number(formulario.stock_minimo),
      proveedor_id: Number(formulario.proveedor_id),
    };
    try {
      const id = await guardar.mutateAsync({ id: productoEditando?.id, producto });
      limpiar();
      setMensaje({ tipo: 'exito', texto: `${productoEditando ? 'Producto actualizado' : 'Producto creado'} (ID ${id}).` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  async function alternarEstado(producto) {
    setMensaje(null);
    try {
      await cambiarEstado.mutateAsync({ id: producto.id, activo: !producto.activo });
      setMensaje({ tipo: 'exito', texto: `${producto.codigo} ${producto.activo ? 'desactivado' : 'activado'}.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  return (
    <section className="pagina catalogo">
      <header className="pagina__encabezado">
        <div>
          <h1>Catálogo de productos</h1>
          <p>Administra pisos y accesorios conservando su historial y unidad base.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`catalogo__mensaje catalogo__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {consulta.isLoading && <EmptyState loading title="Consultando productos y proveedores…" />}
      {consulta.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el catálogo.">
          <button className="btn btn--secondary" type="button" onClick={() => consulta.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!consulta.isLoading && !consulta.isError && proveedores.length === 0 && (
        <div className="card"><EmptyState icon="proveedores" title="Primero registra un proveedor activo." /></div>
      )}

      {!consulta.isLoading && !consulta.isError && proveedores.length > 0 && (
        <form id="catalogo-formulario" className="card catalogo__formulario" onSubmit={guardarProducto}>
          <div>
            <h2>{productoEditando ? `Editar ${productoEditando.codigo}` : 'Nuevo producto'}</h2>
            <p>Los pisos se guardan en piezas; los accesorios, en su unidad base.</p>
          </div>
          <div className="catalogo__campos">
            <label className="field">
              <span className="field__label">Código SKU</span>
              <input className="input" required maxLength="50" value={formulario.codigo} onChange={(event) => cambiar('codigo', event.target.value)} disabled={guardar.isPending} />
            </label>
            <label className="field">
              <span className="field__label">Nombre del producto</span>
              <input className="input" required maxLength="180" value={formulario.nombre} onChange={(event) => cambiar('nombre', event.target.value)} disabled={guardar.isPending} />
            </label>
            <label className="field">
              <span className="field__label">Tipo</span>
              <select
                className="input"
                value={formulario.tipo}
                onChange={(event) => {
                  const tipo = event.target.value;
                  setFormulario((anterior) => ({
                    ...anterior,
                    tipo,
                    unidad: tipo === 'piso' ? 'pieza' : 'unidad',
                    piezas_por_caja: tipo === 'piso' ? anterior.piezas_por_caja : '',
                    despacho_por: tipo === 'piso' ? 'ambos' : 'pieza',
                  }));
                }}
                disabled={guardar.isPending}
              >
                <option value="piso">Piso o revestimiento</option>
                <option value="accesorio">Accesorio o material</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Categoría</span>
              <input className="input" required maxLength="100" value={formulario.categoria} onChange={(event) => cambiar('categoria', event.target.value)} disabled={guardar.isPending} />
            </label>
            <label className="field">
              <span className="field__label">Medida <span className="catalogo__opcional">(opcional)</span></span>
              <input className="input" maxLength="80" placeholder="Ej. 60 × 120 cm" value={formulario.medida} onChange={(event) => cambiar('medida', event.target.value)} disabled={guardar.isPending} />
            </label>
            {formulario.tipo === 'piso' ? (
              <>
                <label className="field">
                  <span className="field__label">Piezas por caja</span>
                  <input className="input" type="number" required min="1" step="1" value={formulario.piezas_por_caja} onChange={(event) => cambiar('piezas_por_caja', event.target.value)} disabled={guardar.isPending} />
                </label>
                <label className="field">
                  <span className="field__label">Se despacha por</span>
                  <select className="input" value={formulario.despacho_por} onChange={(event) => cambiar('despacho_por', event.target.value)} disabled={guardar.isPending}>
                    <option value="caja">Caja</option>
                    <option value="pieza">Pieza</option>
                    <option value="ambos">Caja o pieza</option>
                  </select>
                </label>
              </>
            ) : (
              <label className="field">
                <span className="field__label">Unidad base</span>
                <select className="input" value={formulario.unidad} onChange={(event) => cambiar('unidad', event.target.value)} disabled={guardar.isPending}>
                  {UNIDADES.filter(([id]) => id !== 'pieza').map(([id, texto]) => <option key={id} value={id}>{texto}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              <span className="field__label">Stock mínimo</span>
              <input className="input" type="number" min="0" step="1" value={formulario.stock_minimo} onChange={(event) => cambiar('stock_minimo', event.target.value)} disabled={guardar.isPending} />
            </label>
            <label className="field">
              <span className="field__label">Proveedor</span>
              <select className="input" required value={formulario.proveedor_id} onChange={(event) => cambiar('proveedor_id', event.target.value)} disabled={guardar.isPending}>
                <option value="">Selecciona proveedor</option>
                {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}{proveedor.activo ? '' : ' (inactivo)'}</option>)}
              </select>
            </label>
          </div>
          <footer className="catalogo__acciones">
            {productoEditando && <button className="btn btn--secondary" type="button" onClick={limpiar} disabled={guardar.isPending}>Cancelar edición</button>}
            <button className="btn btn--primary" type="submit" disabled={!valido || guardar.isPending}>
              {guardar.isPending ? 'Guardando…' : productoEditando ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </footer>
        </form>
      )}

      <section className="catalogo__lista" aria-labelledby="catalogo-lista-titulo">
        <header>
          <div><h2 id="catalogo-lista-titulo">Productos</h2><p>{productosVisibles.length} visibles de {productos.length}</p></div>
          <button className="btn btn--secondary" type="button" onClick={() => consulta.refetch()} disabled={consulta.isFetching}>Actualizar</button>
        </header>
        <div className="card catalogo__filtros">
          <label className="field">
            <span className="field__label">Buscar</span>
            <input className="input" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código, nombre o categoría" />
          </label>
          <label className="field">
            <span className="field__label">Estado</span>
            <select className="input" value={estadoFiltro} onChange={(event) => setEstadoFiltro(event.target.value)}>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        </div>
        {!consulta.isLoading && !consulta.isError && productosVisibles.length === 0 && <div className="card"><EmptyState title="No hay productos para los filtros seleccionados." /></div>}
        {!consulta.isLoading && !consulta.isError && productosVisibles.length > 0 && (
          <div className="tabla-scroll card catalogo__tabla">
            <table className="table table--stack">
              <thead><tr><th scope="col">Producto</th><th scope="col">Tipo y unidad</th><th scope="col">Categoría</th><th scope="col">Empaque</th><th scope="col">Mínimo</th><th scope="col">Proveedor</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody>{productosVisibles.map((producto) => (
                <tr key={producto.id}>
                  <td data-label="Producto"><strong>{producto.nombre}</strong><small className="catalogo__meta">{producto.codigo}{producto.medida ? ` · ${producto.medida}` : ''}</small></td>
                  <td data-label="Tipo y unidad">{producto.tipo === 'piso' ? 'Piso · pieza' : `Accesorio · ${producto.unidad}`}</td>
                  <td data-label="Categoría">{producto.categoria}</td>
                  <td data-label="Empaque">{producto.tipo === 'piso' ? `${producto.piezas_por_caja} pzas/caja · ${producto.despacho_por}` : 'Unidad simple'}</td>
                  <td data-label="Mínimo">{formatoStock(producto.stock_minimo, producto)}</td>
                  <td data-label="Proveedor">{producto.proveedor?.nombre || 'Proveedor no disponible'}</td>
                  <td data-label="Estado"><StatusBadge estado={producto.activo ? 'activo' : 'inactivo'} /></td>
                  <td data-label="Acciones" className="catalogo__fila-acciones">
                    <button className="btn btn--secondary" type="button" onClick={() => editar(producto)}>Editar</button>
                    <button className="btn btn--secondary" type="button" onClick={() => alternarEstado(producto)} disabled={cambiarEstado.isPending}>
                      {producto.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
