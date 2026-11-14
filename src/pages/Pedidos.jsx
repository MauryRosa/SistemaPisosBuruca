import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAuth } from '../context/useAuth.js';
import {
  useCatalogosPedido,
  useCerrarPedido,
  useCrearPedido,
  usePedidos,
} from '../hooks/usePedidos.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/pedidos.css';

const ESTADOS = [
  ['todas', 'Todas las órdenes'],
  ['abierta', 'Abiertas'],
  ['parcial', 'Recibidas parcialmente'],
  ['cerrada', 'Cerradas'],
];
const TAMANO_PAGINA_PEDIDOS = 20;

function fecha(valor) {
  if (!valor) return 'Sin fecha estimada';
  return new Date(`${valor}T12:00:00`).toLocaleDateString('es-SV', { dateStyle: 'medium' });
}

function explicarError(error) {
  if (error?.code === 'P0001') return error.message;
  if (error?.code === '23505') return 'El pedido ya existe. Actualiza la lista antes de volver a intentarlo.';
  return 'No se pudo completar la operación. Revisa tu conexión y vuelve a intentarlo.';
}

function nuevaLinea() {
  return { productoId: '', cajas: '', piezas: '', cantidad: '' };
}

export default function Pedidos() {
  const { perfil } = useAuth();
  const { data: catalogos, isLoading: cargandoCatalogos } = useCatalogosPedido();
  const { data: pedidos = [], isLoading, isError, refetch } = usePedidos();
  const crear = useCrearPedido();
  const cerrar = useCerrarPedido();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [fechaEstimada, setFechaEstimada] = useState('');
  const [lineas, setLineas] = useState([nuevaLinea()]);
  const [estadoFiltro, setEstadoFiltro] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [cierre, setCierre] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [imprimirId, setImprimirId] = useState(null);

  useEffect(() => {
    if (imprimirId === null) return;
    window.print();
    setImprimirId(null);
  }, [imprimirId]);

  const productosProveedor = useMemo(() => {
    const todos = catalogos?.productos || [];
    if (!proveedorId) return [];
    return todos.filter(
      (producto) => producto.proveedor_id === null || producto.proveedor_id === Number(proveedorId),
    );
  }, [catalogos?.productos, proveedorId]);

  const pedidosFiltrados = pedidos.filter((pedido) => {
    const coincideEstado = estadoFiltro === 'todas' || pedido.estado === estadoFiltro;
    const texto = `${pedido.numero} ${pedido.proveedor?.nombre || ''}`.toLocaleLowerCase('es');
    return coincideEstado && texto.includes(busqueda.trim().toLocaleLowerCase('es'));
  });
  const paginas = Math.ceil(pedidosFiltrados.length / TAMANO_PAGINA_PEDIDOS);
  const paginaActual = Math.min(pagina, Math.max(0, paginas - 1));
  const pedidosVisibles = pedidosFiltrados.slice(
    paginaActual * TAMANO_PAGINA_PEDIDOS,
    (paginaActual + 1) * TAMANO_PAGINA_PEDIDOS,
  );

  const guardando = crear.isPending || cerrar.isPending;
  const lineasValidas = lineas.every((linea) => {
    const producto = catalogos?.productos.find((item) => item.id === Number(linea.productoId));
    if (!producto) return false;
    const cantidad = producto.tipo === 'piso'
      ? aPiezas(linea.cajas, linea.piezas, producto.piezas_por_caja)
      : Number(linea.cantidad);
    return Number.isInteger(cantidad) && cantidad > 0;
  });
  const puedeGuardar = Boolean(
    proveedorId && lineas.length > 0 && lineasValidas && !cargandoCatalogos && !guardando,
  );

  function actualizarLinea(indice, cambios) {
    setLineas((anteriores) => anteriores.map((linea, posicion) => (
      posicion === indice ? { ...linea, ...cambios } : linea
    )));
  }

  function actualizarProveedor(valor) {
    setProveedorId(valor);
    setLineas([nuevaLinea()]);
  }

  async function guardarPedido(event) {
    event.preventDefault();
    if (!puedeGuardar) return;
    setMensaje(null);
    const detalles = lineas.map((linea) => {
      const producto = catalogos.productos.find((item) => item.id === Number(linea.productoId));
      const cantidad = producto.tipo === 'piso'
        ? aPiezas(linea.cajas, linea.piezas, producto.piezas_por_caja)
        : Number(linea.cantidad);
      return { producto_id: producto.id, cantidad };
    });

    try {
      await crear.mutateAsync({
        p_proveedor_id: Number(proveedorId),
        p_fecha_estimada: fechaEstimada || null,
        p_detalles: detalles,
      });
      setProveedorId('');
      setFechaEstimada('');
      setLineas([nuevaLinea()]);
      setMostrarFormulario(false);
      setMensaje({ tipo: 'exito', texto: 'Orden de pedido creada.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function cerrarPedido(event, pedido) {
    event.preventDefault();
    if (!cierre?.motivo.trim()) return;
    setMensaje(null);
    try {
      await cerrar.mutateAsync({ p_orden_id: pedido.id, p_motivo: cierre.motivo.trim() });
      setCierre(null);
      setMensaje({ tipo: 'exito', texto: `Se cerró la orden ${pedido.numero}.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  return (
    <section className="pagina">
      <header className="pagina__encabezado pedidos__encabezado">
        <div>
          <h1>Pedidos a proveedor</h1>
          <p>Registra lo solicitado y compara cada recepción con la cantidad pedida.</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={mostrarFormulario}
          aria-controls="formulario-pedido"
          onClick={() => {
            setMostrarFormulario((visible) => !visible);
            setMensaje(null);
          }}
        >
          {mostrarFormulario ? 'Cerrar formulario' : 'Nueva orden'}
        </button>
      </header>

      {mensaje && (
        <p className={`pedidos__mensaje pedidos__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {mostrarFormulario && (
        <form id="formulario-pedido" className="card pedidos__formulario" onSubmit={guardarPedido}>
          <div className="pedidos__formulario-cabecera">
            <div>
              <h2>Crear orden de pedido</h2>
              <p>El sistema asigna un correlativo por año al guardar.</p>
            </div>
          </div>
          <div className="pedidos__datos">
            <label className="field">
              <span className="field__label">Proveedor</span>
              <select
                className="input"
                required
                value={proveedorId}
                onChange={(event) => actualizarProveedor(event.target.value)}
                disabled={cargandoCatalogos || guardando}
              >
                <option value="">Selecciona un proveedor</option>
                {catalogos?.proveedores.map((proveedor) => (
                  <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Fecha estimada de entrega</span>
              <input
                className="input"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={fechaEstimada}
                onChange={(event) => setFechaEstimada(event.target.value)}
                disabled={guardando}
              />
            </label>
          </div>

          {proveedorId && (
            <div className="pedidos__lineas-formulario">
              <div className="pedidos__lineas-titulo">
                <div>
                  <h3>Productos</h3>
                  <p>Los pisos se guardan en piezas; las cajas se convierten automáticamente.</p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setLineas((anteriores) => [...anteriores, nuevaLinea()])}
                  disabled={guardando || productosProveedor.length === 0}
                >
                  Agregar producto
                </button>
              </div>
              {productosProveedor.length === 0 && (
                <p className="pedidos__ayuda">No hay productos activos asignados a este proveedor.</p>
              )}
              {lineas.map((linea, indice) => {
                const producto = catalogos?.productos.find((item) => item.id === Number(linea.productoId));
                return (
                  <div className="pedidos__linea-formulario" key={indice}>
                    <label className="field pedidos__producto">
                      <span className="field__label">Producto</span>
                      <select
                        className="input"
                        required
                        value={linea.productoId}
                        onChange={(event) => actualizarLinea(indice, {
                          productoId: event.target.value,
                          cajas: '',
                          piezas: '',
                          cantidad: '',
                        })}
                        disabled={guardando}
                      >
                        <option value="">Selecciona un producto</option>
                        {productosProveedor.map((opcion) => {
                          const repetido = lineas.some((otra, posicion) => (
                            posicion !== indice && Number(otra.productoId) === opcion.id
                          ));
                          return (
                            <option key={opcion.id} value={opcion.id} disabled={repetido}>
                              {opcion.codigo} · {opcion.nombre}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {producto?.tipo === 'piso' ? (
                      <>
                        <label className="field pedidos__cantidad-campo">
                          <span className="field__label">Cajas</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={linea.cajas}
                            onChange={(event) => actualizarLinea(indice, { cajas: event.target.value })}
                            disabled={guardando}
                          />
                        </label>
                        <label className="field pedidos__cantidad-campo">
                          <span className="field__label">Piezas sueltas</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={linea.piezas}
                            onChange={(event) => actualizarLinea(indice, { piezas: event.target.value })}
                            disabled={guardando}
                          />
                        </label>
                      </>
                    ) : producto ? (
                      <label className="field pedidos__cantidad-campo">
                        <span className="field__label">Cantidad ({producto.unidad})</span>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          step="1"
                          required
                          inputMode="numeric"
                          value={linea.cantidad}
                          onChange={(event) => actualizarLinea(indice, { cantidad: event.target.value })}
                          disabled={guardando}
                        />
                      </label>
                    ) : (
                      <div className="pedidos__cantidad-vacia" aria-hidden="true" />
                    )}
                    {producto && (
                      <p className="pedidos__cantidad-resumen">
                        Se pedirán: {formatoStock(
                          producto.tipo === 'piso'
                            ? aPiezas(linea.cajas, linea.piezas, producto.piezas_por_caja)
                            : Number(linea.cantidad),
                          producto,
                        )}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn--ghost pedidos__quitar-linea"
                      aria-label={`Quitar línea ${indice + 1}`}
                      disabled={guardando || lineas.length === 1}
                      onClick={() => setLineas((anteriores) => anteriores.filter((_, i) => i !== indice))}
                    >
                      Quitar
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pedidos__acciones-formulario">
            <button className="btn btn--primary" type="submit" disabled={!puedeGuardar}>
              {crear.isPending ? 'Guardando…' : 'Crear orden de pedido'}
            </button>
          </div>
        </form>
      )}

      <div className="pedidos__filtros">
        <label className="field pedidos__busqueda">
          <span className="field__label">Buscar orden o proveedor</span>
          <input
            className="input"
            type="search"
            value={busqueda}
            onChange={(event) => {
              setBusqueda(event.target.value);
              setPagina(0);
            }}
            placeholder="OP-2026-00001"
          />
        </label>
        <label className="field">
          <span className="field__label">Estado</span>
          <select className="input" value={estadoFiltro} onChange={(event) => {
            setEstadoFiltro(event.target.value);
            setPagina(0);
          }}>
            {ESTADOS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
      </div>

      {isLoading && <EmptyState loading title="Consultando órdenes de pedido…" />}
      {isError && (
        <EmptyState icon="alerta" title="No se pudieron cargar las órdenes.">
          <button type="button" className="btn btn--secondary" onClick={() => refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!isLoading && !isError && pedidosFiltrados.length === 0 && (
        <div className="card">
          <EmptyState icon="cart" title={pedidos.length ? 'No hay órdenes con esos filtros.' : 'Todavía no hay órdenes de pedido.'} />
        </div>
      )}

      {!isLoading && !isError && pedidosFiltrados.length > 0 && (
        <>
          <p className="pedidos__resumen" aria-live="polite">
            Mostrando {paginaActual * TAMANO_PAGINA_PEDIDOS + 1}–{Math.min((paginaActual + 1) * TAMANO_PAGINA_PEDIDOS, pedidosFiltrados.length)} de {pedidosFiltrados.length} órdenes
          </p>
          <div className="pedidos__lista">
          {pedidosVisibles.map((pedido) => (
            <article className={`card pedidos__tarjeta${imprimirId === pedido.id ? ' pedidos__tarjeta--imprimir' : ''}`} key={pedido.id}>
              <header className="pedidos__tarjeta-cabecera">
                <div>
                  <p className="pedidos__numero">{pedido.numero}</p>
                  <h2>{pedido.proveedor?.nombre || 'Proveedor no disponible'}</h2>
                  <p className="pedidos__meta">
                    Emitida {fecha(pedido.fecha)} · {pedido.creadoPorNombre} · Entrega: {fecha(pedido.fecha_estimada)}
                  </p>
                </div>
                <StatusBadge estado={pedido.estado} />
              </header>

              <div className="pedidos__detalle">
                {pedido.detalles.map((detalle) => {
                  const producto = detalle.producto;
                  const restante = Math.max(detalle.cantidad - detalle.cantidad_recibida, 0);
                  const sobrante = Math.max(detalle.cantidad_recibida - detalle.cantidad, 0);
                  return (
                    <div className="pedidos__detalle-fila" key={detalle.id}>
                      <div>
                        <strong>{producto?.nombre || 'Producto no disponible'}</strong>
                        {producto?.codigo && <span className="pedidos__meta">{producto.codigo}</span>}
                        <small>
                          Recibido {formatoStock(detalle.cantidad_recibida, producto || { tipo: 'accesorio', unidad: 'unidad' })}
                          {' · '}
                          {sobrante > 0
                            ? `sobran ${sobrante}`
                            : restante > 0
                              ? `faltan ${formatoStock(restante, producto || { tipo: 'accesorio', unidad: 'unidad' })}`
                              : 'completo'}
                        </small>
                      </div>
                      <strong className="pedidos__cantidad">
                        {formatoStock(detalle.cantidad, producto || { tipo: 'accesorio', unidad: 'unidad' })}
                      </strong>
                    </div>
                  );
                })}
              </div>

              {pedido.motivo_cierre && <p className="pedidos__cierre">Cierre anticipado: {pedido.motivo_cierre}</p>}

              <div className="pedidos__acciones pedidos__acciones--impresion">
                <button type="button" className="btn btn--secondary" onClick={() => setImprimirId(pedido.id)}>
                  Imprimir o guardar en PDF
                </button>
              </div>

              {perfil?.rol === 'administrador' && ['abierta', 'parcial'].includes(pedido.estado) && (
                cierre?.id === pedido.id ? (
                  <form className="pedidos__cerrar-form" onSubmit={(event) => cerrarPedido(event, pedido)}>
                    <label className="field">
                      <span className="field__label">Motivo del cierre anticipado</span>
                      <input
                        className="input"
                        required
                        maxLength={500}
                        value={cierre.motivo}
                        onChange={(event) => setCierre({ ...cierre, motivo: event.target.value })}
                      />
                    </label>
                    <button className="btn btn--primary" type="submit" disabled={guardando || !cierre.motivo.trim()}>
                      {cerrar.isPending ? 'Cerrando…' : 'Confirmar cierre'}
                    </button>
                    <button className="btn btn--secondary" type="button" onClick={() => setCierre(null)} disabled={guardando}>
                      Cancelar
                    </button>
                  </form>
                ) : (
                  <div className="pedidos__acciones">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => setCierre({ id: pedido.id, motivo: '' })}
                      disabled={guardando}
                    >
                      Cerrar por acuerdo con proveedor
                    </button>
                  </div>
                )
              )}
            </article>
          ))}
          </div>
          {paginas > 1 && (
            <nav className="pedidos__paginacion" aria-label="Paginación de órdenes">
              <button type="button" className="btn btn--secondary" onClick={() => setPagina(paginaActual - 1)} disabled={paginaActual === 0}>
                Anterior
              </button>
              <span>Página {paginaActual + 1} de {paginas}</span>
              <button type="button" className="btn btn--secondary" onClick={() => setPagina(paginaActual + 1)} disabled={paginaActual + 1 >= paginas}>
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
