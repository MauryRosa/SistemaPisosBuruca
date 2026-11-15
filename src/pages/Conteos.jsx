import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAuth } from '../context/useAuth.js';
import { useAprobarConteo, useCatalogoConteos, useConteos, useRegistrarConteo, useStockConteo } from '../hooks/useConteos.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/conteos.css';

function cantidadCapturada(producto, valores) {
  if (producto.tipo === 'piso') return aPiezas(valores?.cajas, valores?.piezas, producto.piezas_por_caja);
  return Number(valores?.cantidad) || 0;
}

function diferenciaTexto(diferencia, producto) {
  if (!diferencia) return 'Sin diferencia';
  const signo = diferencia > 0 ? '+' : '−';
  return `${signo}${formatoStock(Math.abs(diferencia), producto)}`;
}

function mensajeError(error) {
  if (error?.code === 'P0001') return error.message;
  return 'No se pudo procesar el conteo. Actualiza la información e inténtalo de nuevo.';
}

export default function Conteos() {
  const { perfil } = useAuth();
  const esAdmin = perfil?.rol === 'administrador';
  const [alcance, setAlcance] = useState('total');
  const [categoria, setCategoria] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [valores, setValores] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const catalogo = useCatalogoConteos();
  const conteosQuery = useConteos();
  const conteos = conteosQuery.data || [];
  const ubicaciones = catalogo.data?.ubicaciones || [];
  const ubicacion = ubicaciones.find((item) => item.id === Number(ubicacionId)) || ubicaciones[0];
  const stockQuery = useStockConteo(ubicacion?.id);
  const stockPorProducto = useMemo(
    () => new Map((stockQuery.data || []).map((fila) => [fila.producto_id, fila])),
    [stockQuery.data],
  );
  const todosProductos = catalogo.data?.productos || [];
  const productosConteo = todosProductos.filter((producto) => alcance === 'total' || producto.categoria === categoria);
  const productosVisibles = productosConteo.filter((producto) => (
    `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ));
  const cantidadesValidas = productosConteo.length > 0 && productosConteo.every((producto) => {
    const valor = valores[producto.id] || {};
    const tieneCantidad = producto.tipo === 'piso'
      ? valor.cajas !== undefined && valor.cajas !== '' || valor.piezas !== undefined && valor.piezas !== ''
      : valor.cantidad !== undefined && valor.cantidad !== '';
    if (!tieneCantidad) return false;
    const cantidad = cantidadCapturada(producto, valor);
    if (!Number.isInteger(cantidad) || cantidad < 0) return false;
    if (producto.tipo !== 'piso') return true;
    const cajas = Number(valor.cajas) || 0;
    const piezas = Number(valor.piezas) || 0;
    return Number.isInteger(cajas) && cajas >= 0
      && Number.isInteger(piezas) && piezas >= 0 && piezas < producto.piezas_por_caja;
  });
  const productosCapturados = productosConteo.filter((producto) => {
    const valor = valores[producto.id] || {};
    return producto.tipo === 'piso'
      ? (valor.cajas !== undefined && valor.cajas !== '') || (valor.piezas !== undefined && valor.piezas !== '')
      : valor.cantidad !== undefined && valor.cantidad !== '';
  }).length;
  const registrar = useRegistrarConteo();
  const aprobar = useAprobarConteo();

  function cambiarAlcance(nuevo) {
    setAlcance(nuevo);
    setCategoria('');
    setValores({});
  }

  async function guardarConteo(event) {
    event.preventDefault();
    if (!ubicacion || !cantidadesValidas) return;
    setMensaje(null);
    const detalles = productosConteo.map((producto) => ({
      producto_id: producto.id,
      cantidad_contada: cantidadCapturada(producto, valores[producto.id]),
    }));
    try {
      const id = await registrar.mutateAsync({
        p_alcance: alcance,
        p_categoria: alcance === 'categoria' ? categoria : null,
        p_ubicacion_id: ubicacion.id,
        p_detalles: detalles,
      });
      setValores({});
      setBusqueda('');
      setMensaje({ tipo: 'exito', texto: `Conteo ${id} guardado como pendiente. Las diferencias no cambian el stock hasta su aprobación.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  async function aprobarConteo(conteo) {
    setMensaje(null);
    try {
      await aprobar.mutateAsync({ p_conteo_id: conteo.id });
      setMensaje({ tipo: 'exito', texto: `Conteo ${conteo.id} aprobado. Los ajustes se aplicaron en documentos transaccionales.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  return (
    <section className="pagina conteos">
      <header className="pagina__encabezado">
        <div>
          <h1>Conteos físicos</h1>
          <p>Compara el físico con el sistema por ubicación y deja los ajustes pendientes de aprobación.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`conteos__mensaje conteos__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {catalogo.isLoading && <EmptyState loading title="Consultando productos y ubicaciones…" />}
      {catalogo.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el catálogo de conteos.">
          <button className="btn btn--secondary" type="button" onClick={() => catalogo.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!catalogo.isLoading && !catalogo.isError && ubicaciones.length === 0 && (
        <div className="card"><EmptyState icon="ubicacion" title="No hay ubicaciones activas para contar." /></div>
      )}

      {!catalogo.isLoading && !catalogo.isError && ubicaciones.length > 0 && (
        <form className="card conteos__formulario" onSubmit={guardarConteo}>
          <div>
            <h2>Nuevo conteo</h2>
            <p>Captura todos los productos del alcance; el saldo de sistema queda registrado como fotografía del momento.</p>
          </div>
          <div className="conteos__campos">
            <label className="field">
              <span className="field__label">Ubicación</span>
              <select className="input" value={ubicacion?.id || ''} onChange={(event) => { setUbicacionId(event.target.value); setValores({}); }} disabled={registrar.isPending}>
                {ubicaciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Alcance</span>
              <select className="input" value={alcance} onChange={(event) => cambiarAlcance(event.target.value)} disabled={registrar.isPending}>
                <option value="total">Todos los productos</option>
                <option value="categoria">Por categoría</option>
              </select>
            </label>
            {alcance === 'categoria' && (
              <label className="field">
                <span className="field__label">Categoría</span>
                <select className="input" required value={categoria} onChange={(event) => { setCategoria(event.target.value); setValores({}); }} disabled={registrar.isPending}>
                  <option value="">Selecciona categoría</option>
                  {catalogo.data?.categorias.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            )}
          </div>

          {stockQuery.isLoading && <EmptyState loading title="Consultando existencias actuales…" />}
          {stockQuery.isError && (
            <EmptyState icon="alerta" title="No se pudo consultar la existencia del sistema.">
              <button className="btn btn--secondary" type="button" onClick={() => stockQuery.refetch()}>Reintentar</button>
            </EmptyState>
          )}
          {!stockQuery.isLoading && !stockQuery.isError && productosConteo.length === 0 && alcance === 'categoria' && categoria && (
            <EmptyState title="No hay productos activos en esta categoría." />
          )}
          {!stockQuery.isLoading && !stockQuery.isError && productosConteo.length > 0 && (
            <>
              <div className="conteos__productos-cabecera">
                <div>
                  <h3>Productos a contar ({productosConteo.length})</h3>
                  <p>Marca cero cuando el producto no está físicamente en la ubicación.</p>
                </div>
                <label className="field conteos__busqueda">
                  <span className="field__label">Buscar producto</span>
                  <input className="input" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código o nombre" disabled={registrar.isPending} />
                </label>
              </div>
              {productosVisibles.length === 0 ? <EmptyState title="No hay productos que coincidan con la búsqueda." /> : (
                <div className="conteos__productos">
                  {productosVisibles.map((item) => {
                    const actual = Number(stockPorProducto.get(item.id)?.fisico) || 0;
                    const valor = valores[item.id] || {};
                    const cantidadContada = cantidadCapturada(item, valor);
                    const diferencia = valor.cantidad !== undefined || valor.cajas !== undefined || valor.piezas !== undefined
                      ? cantidadContada - actual
                      : null;
                    return (
                      <article className="conteos__producto" key={item.id}>
                        <header>
                          <div>
                            <h4>{item.nombre}</h4>
                            <p>{item.codigo} · {item.tipo === 'piso' ? 'Piso' : item.unidad}</p>
                          </div>
                          <p className="conteos__sistema">Sistema: <strong>{formatoStock(actual, item)}</strong></p>
                        </header>
                        <div className="conteos__captura">
                          {item.tipo === 'piso' ? (
                            <>
                              <label className="field">
                                <span className="field__label">Cajas contadas</span>
                                <input className="input" type="number" min="0" step="1" inputMode="numeric" value={valor.cajas ?? ''} onChange={(event) => setValores((anterior) => ({ ...anterior, [item.id]: { ...anterior[item.id], cajas: event.target.value } }))} disabled={registrar.isPending} />
                              </label>
                              <label className="field">
                                <span className="field__label">Piezas sueltas</span>
                                <input className="input" type="number" min="0" max={item.piezas_por_caja - 1} step="1" inputMode="numeric" value={valor.piezas ?? ''} onChange={(event) => setValores((anterior) => ({ ...anterior, [item.id]: { ...anterior[item.id], piezas: event.target.value } }))} disabled={registrar.isPending} />
                              </label>
                            </>
                          ) : (
                            <label className="field">
                              <span className="field__label">Cantidad contada ({item.unidad})</span>
                              <input className="input" type="number" min="0" step="1" inputMode="numeric" value={valor.cantidad ?? ''} onChange={(event) => setValores((anterior) => ({ ...anterior, [item.id]: { ...anterior[item.id], cantidad: event.target.value } }))} disabled={registrar.isPending} />
                            </label>
                          )}
                          {diferencia !== null && (
                            <p className={`conteos__diferencia${diferencia === 0 ? ' conteos__diferencia--cero' : ''}`}>
                              Contado: {formatoStock(cantidadContada, item)} · Diferencia: {diferenciaTexto(diferencia, item)}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <footer className="conteos__acciones">
                <span>{productosCapturados} de {productosConteo.length} productos capturados</span>
                <button className="btn btn--primary" type="submit" disabled={!cantidadesValidas || registrar.isPending || stockQuery.isFetching}>
                  {registrar.isPending ? 'Guardando…' : 'Guardar conteo pendiente'}
                </button>
              </footer>
            </>
          )}
        </form>
      )}

      <section className="conteos__historial" aria-labelledby="conteos-historial-titulo">
        <div className="conteos__historial-cabecera">
          <div>
            <h2 id="conteos-historial-titulo">Conteos recientes</h2>
            <p>La aprobación genera documentos de ajuste con su propio correlativo y auditoría.</p>
          </div>
          <button className="btn btn--secondary" type="button" onClick={() => conteosQuery.refetch()} disabled={conteosQuery.isFetching}>Actualizar</button>
        </div>
        {conteosQuery.isLoading && <EmptyState loading title="Consultando conteos…" />}
        {conteosQuery.isError && (
          <EmptyState icon="alerta" title="No se pudo cargar el historial de conteos.">
            <button className="btn btn--secondary" type="button" onClick={() => conteosQuery.refetch()}>Reintentar</button>
          </EmptyState>
        )}
        {!conteosQuery.isLoading && !conteosQuery.isError && conteos.length === 0 && <div className="card"><EmptyState title="Todavía no hay conteos registrados." /></div>}
        {!conteosQuery.isLoading && !conteosQuery.isError && conteos.length > 0 && (
          <div className="conteos__lista">
            {conteos.map((conteo) => {
              const diferenciaCount = conteo.detalles.filter((detalle) => detalle.diferencia !== 0).length;
              return (
                <article className="card conteos__tarjeta" key={conteo.id}>
                  <header>
                    <div>
                      <h3>Conteo {conteo.id} · {conteo.ubicacion}</h3>
                      <p>{conteo.alcance === 'total' ? 'Total' : `Categoría ${conteo.categoria}`} · {conteo.fecha} · {conteo.creador}</p>
                    </div>
                    <StatusBadge estado={conteo.estado} />
                  </header>
                  <p>{conteo.detalles.length} productos · {diferenciaCount} con diferencia</p>
                  <details>
                    <summary>Ver sistema, conteo y diferencias</summary>
                    <ul className="conteos__detalle-lista">
                      {conteo.detalles.map((detalle) => (
                        <li key={detalle.id}>
                          <span>{detalle.producto?.codigo} · {detalle.producto?.nombre}</span>
                          <span>Sistema {detalle.producto ? formatoStock(detalle.cantidad_sistema, detalle.producto) : detalle.cantidad_sistema}</span>
                          <span>Contado {detalle.producto ? formatoStock(detalle.cantidad_contada, detalle.producto) : detalle.cantidad_contada}</span>
                          <strong>{detalle.producto ? diferenciaTexto(detalle.diferencia, detalle.producto) : detalle.diferencia}</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {(conteo.documento_ajuste_id || conteo.documento_ajuste_negativo_id) && (
                    <p className="conteos__documentos">
                      Documentos aplicados: {[
                        conteo.documento_ajuste_id && `positivo #${conteo.documento_ajuste_id}`,
                        conteo.documento_ajuste_negativo_id && `negativo #${conteo.documento_ajuste_negativo_id}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {esAdmin && conteo.estado === 'pendiente' && (
                    <footer className="conteos__acciones">
                      <button className="btn btn--primary" type="button" onClick={() => aprobarConteo(conteo)} disabled={aprobar.isPending}>
                        {aprobar.isPending && aprobar.variables?.p_conteo_id === conteo.id ? 'Aplicando ajustes…' : 'Aprobar y aplicar ajustes'}
                      </button>
                    </footer>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
