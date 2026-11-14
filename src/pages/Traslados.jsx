import { useEffect, useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import {
  useCatalogoTraslados,
  useConfirmarTraslado,
  useCrearTraslado,
  useStockTraslado,
  useTrasladosEnTransito,
} from '../hooks/useTraslados.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/traslados.css';

const VACIO = { cajas: '', piezas: '', cantidad: '' };

function cantidadProducto(producto, valor) {
  return producto.tipo === 'piso'
    ? aPiezas(valor?.cajas, valor?.piezas, producto.piezas_por_caja)
    : Number(valor?.cantidad) || 0;
}

function explicarError(error) {
  if (error?.code === 'P0001') return error.message;
  return 'No se pudo completar el traslado. Actualiza los datos e inténtalo de nuevo.';
}

function CampoContingencia({ checked, onChange, disabled }) {
  return (
    <label className="traslados__contingencia">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>
        <strong>Registro de contingencia en papel</strong>
        <small>Marca si este movimiento se documentó en papel y se digitaliza el mismo día.</small>
      </span>
    </label>
  );
}

function fechaHora(fecha) {
  if (!fecha) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-SV', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha));
}

function CapturaTraslado({ producto, valor, disponible, deshabilitado, onChange }) {
  const cantidad = cantidadProducto(producto, valor);
  const excede = cantidad > disponible;
  return (
    <div className="traslados__captura">
      {producto.tipo === 'piso' ? (
        <>
          <label className="field">
            <span className="field__label">Cajas</span>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={valor?.cajas || ''}
              onChange={(event) => onChange('cajas', event.target.value)}
              disabled={deshabilitado}
              aria-label={`Cajas de ${producto.nombre}`}
            />
          </label>
          <label className="field">
            <span className="field__label">Piezas sueltas</span>
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={valor?.piezas || ''}
              onChange={(event) => onChange('piezas', event.target.value)}
              disabled={deshabilitado}
              aria-label={`Piezas sueltas de ${producto.nombre}`}
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span className="field__label">Cantidad ({producto.unidad})</span>
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={valor?.cantidad || ''}
            onChange={(event) => onChange('cantidad', event.target.value)}
            disabled={deshabilitado}
            aria-label={`Cantidad de ${producto.nombre}`}
          />
        </label>
      )}
      <p className={`traslados__disponible${excede ? ' traslados__disponible--error' : ''}`}>
        {cantidad > 0 ? `Traslado: ${formatoStock(cantidad, producto)} · ` : ''}
        Disponible: {formatoStock(disponible, producto)}
        {excede ? ' · Supera el saldo disponible' : ''}
      </p>
    </div>
  );
}

function LineaTraslado({ linea }) {
  return (
    <li>
      <div>
        <strong>{linea.producto?.nombre || 'Producto no disponible'}</strong>
        <span>{linea.producto?.codigo || '—'}</span>
      </div>
      <strong className="traslados__cantidad">
        {linea.producto ? formatoStock(linea.cantidad, linea.producto) : linea.cantidad}
      </strong>
      <p className="traslados__ubicacion">
        {linea.origen || 'Origen no disponible'} → {linea.destino || 'Destino no disponible'}
      </p>
    </li>
  );
}

export default function Traslados() {
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [cantidades, setCantidades] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [motivo, setMotivo] = useState('');
  const [esContingencia, setEsContingencia] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [documentoImpresion, setDocumentoImpresion] = useState(null);
  const catalogo = useCatalogoTraslados();
  const ubicaciones = catalogo.data?.ubicaciones || [];
  const origenes = ubicaciones.filter((ubicacion) => ubicacion.tipo === 'bodega');
  const destinos = ubicaciones.filter((ubicacion) => ['minibodega', 'exhibicion'].includes(ubicacion.tipo));
  const origenSeleccionado = Number(origenId) || origenes[0]?.id;
  const destinoSeleccionado = Number(destinoId) || destinos[0]?.id;
  const origen = origenes.find((ubicacion) => ubicacion.id === origenSeleccionado);
  const destino = destinos.find((ubicacion) => ubicacion.id === destinoSeleccionado);
  const stockQuery = useStockTraslado(origenSeleccionado);
  const transferencias = useTrasladosEnTransito();
  const crearTraslado = useCrearTraslado();
  const confirmarTraslado = useConfirmarTraslado();
  const stockPorProducto = useMemo(
    () => new Map((stockQuery.data || []).map((fila) => [fila.producto_id, fila])),
    [stockQuery.data],
  );
  const productos = (catalogo.data?.productos || []).filter((producto) => (
    `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ));
  const productosElegidos = (catalogo.data?.productos || []).filter((producto) => (
    cantidadProducto(producto, cantidades[producto.id]) > 0
  ));
  const trasladoValido = Boolean(origen && destino && origen.id !== destino.id)
    && productosElegidos.length > 0
    && productosElegidos.every((producto) => {
      const cantidad = cantidadProducto(producto, cantidades[producto.id]);
      const saldo = stockPorProducto.get(producto.id);
      const disponible = Math.max((Number(saldo?.fisico) || 0) - (Number(saldo?.reservado) || 0), 0);
      return Number.isInteger(cantidad) && cantidad > 0 && cantidad <= disponible;
    });

  useEffect(() => {
    if (!documentoImpresion) return undefined;
    const limpiarImpresion = () => setDocumentoImpresion(null);
    window.addEventListener('afterprint', limpiarImpresion);
    window.print();
    return () => window.removeEventListener('afterprint', limpiarImpresion);
  }, [documentoImpresion]);

  function cambiarUbicacion(setUbicacion, valor) {
    setUbicacion(valor);
    setCantidades({});
    setMensaje(null);
  }

  function cambiarCantidad(productoId, campo, valor) {
    setCantidades((anteriores) => ({
      ...anteriores,
      [productoId]: { ...VACIO, ...anteriores[productoId], [campo]: valor },
    }));
  }

  async function enviarTraslado(event) {
    event.preventDefault();
    if (!trasladoValido || !origen || !destino) return;
    setMensaje(null);
    const detalles = productosElegidos.map((producto) => ({
      producto_id: producto.id,
      cantidad: cantidadProducto(producto, cantidades[producto.id]),
      ubicacion_origen_id: origen.id,
      ubicacion_destino_id: destino.id,
    }));
    try {
      await crearTraslado.mutateAsync({
        tipo: 'traslado',
        cabecera: { motivo: motivo.trim() || null, es_contingencia: esContingencia },
        detalles,
      });
      setCantidades({});
      setMotivo('');
      setEsContingencia(false);
      setMensaje({ tipo: 'exito', texto: 'Traslado enviado. El destino recibirá el saldo al confirmar la entrega.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function recibirTraslado(documento) {
    setMensaje(null);
    try {
      await confirmarTraslado.mutateAsync({ p_documento_id: documento.id });
      setMensaje({ tipo: 'exito', texto: `Traslado ${documento.numero} recibido y aplicado al destino.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  return (
    <section className={`pagina traslados${documentoImpresion ? ' traslados--imprimiendo' : ''}`}>
      <header className="pagina__encabezado traslados__encabezado">
        <div>
          <h1>Traslados</h1>
          <p>Envía existencias desde la bodega y confirma la recepción en el destino.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`traslados__mensaje traslados__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {catalogo.isLoading && <EmptyState loading title="Consultando productos y ubicaciones…" />}
      {catalogo.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el catálogo de traslados.">
          <button className="btn btn--secondary" type="button" onClick={() => catalogo.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!catalogo.isLoading && !catalogo.isError && (origenes.length === 0 || destinos.length === 0) && (
        <div className="card">
          <EmptyState icon="ubicacion" title="Falta una ubicación para completar el traslado.">
            <p>Se necesita una bodega activa y una minibodega o exhibición activa.</p>
          </EmptyState>
        </div>
      )}

      {!catalogo.isLoading && !catalogo.isError && origenes.length > 0 && destinos.length > 0 && (
        <form className="card traslados__formulario" onSubmit={enviarTraslado}>
          <div className="traslados__formulario-cabecera">
            <div>
              <h2>Enviar productos</h2>
              <p>La bodega descuenta al enviar; el destino suma al confirmar la recepción.</p>
            </div>
          </div>

          <div className="traslados__ubicaciones-campos">
            <label className="field">
              <span className="field__label">Origen · bodega</span>
              <select
                className="input"
                value={origen?.id || ''}
                onChange={(event) => cambiarUbicacion(setOrigenId, event.target.value)}
                disabled={crearTraslado.isPending}
              >
                {origenes.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Destino</span>
              <select
                className="input"
                value={destino?.id || ''}
                onChange={(event) => cambiarUbicacion(setDestinoId, event.target.value)}
                disabled={crearTraslado.isPending}
              >
                {destinos.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </label>
            <label className="field traslados__motivo">
              <span className="field__label">Nota del traslado <span className="field__optional">(opcional)</span></span>
              <input
                className="input"
                type="text"
                maxLength="500"
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Referencia o instrucciones para recibir"
                disabled={crearTraslado.isPending}
              />
            </label>
          </div>

          <CampoContingencia checked={esContingencia} onChange={setEsContingencia} disabled={crearTraslado.isPending} />

          <div className="traslados__productos-cabecera">
            <div>
              <h3>Productos</h3>
              <p>Las cantidades se expresan en la unidad base del inventario.</p>
            </div>
            <label className="field traslados__busqueda">
              <span className="field__label">Buscar producto</span>
              <input
                className="input"
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Código o nombre"
                disabled={crearTraslado.isPending}
              />
            </label>
          </div>

          {stockQuery.isLoading && <EmptyState loading title="Consultando saldo disponible…" />}
          {stockQuery.isError && (
            <EmptyState icon="alerta" title="No se pudo consultar el saldo de esta bodega.">
              <button className="btn btn--secondary" type="button" onClick={() => stockQuery.refetch()}>Reintentar</button>
            </EmptyState>
          )}
          {!stockQuery.isLoading && !stockQuery.isError && productos.length === 0 && (
            <EmptyState title="No hay productos que coincidan con la búsqueda." />
          )}
          {!stockQuery.isLoading && !stockQuery.isError && productos.length > 0 && (
            <div className="traslados__productos">
              {productos.map((producto) => {
                const saldo = stockPorProducto.get(producto.id);
                const disponible = Math.max((Number(saldo?.fisico) || 0) - (Number(saldo?.reservado) || 0), 0);
                return (
                  <article className="traslados__producto" key={producto.id}>
                    <header>
                      <div>
                        <h4>{producto.nombre}</h4>
                        <p>{producto.codigo} · {producto.tipo === 'piso' ? 'Piso' : producto.unidad}</p>
                      </div>
                    </header>
                    {disponible > 0 ? (
                      <CapturaTraslado
                        producto={producto}
                        valor={cantidades[producto.id] || VACIO}
                        disponible={disponible}
                        deshabilitado={crearTraslado.isPending || stockQuery.isFetching}
                        onChange={(campo, valor) => cambiarCantidad(producto.id, campo, valor)}
                      />
                    ) : (
                      <p className="traslados__sin-stock">Sin saldo disponible en esta bodega.</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="traslados__acciones">
            <button className="btn btn--primary" type="submit" disabled={!trasladoValido || crearTraslado.isPending || stockQuery.isFetching}>
              {crearTraslado.isPending ? 'Enviando…' : `Enviar ${productosElegidos.length || ''} ${productosElegidos.length === 1 ? 'producto' : 'productos'}`}
            </button>
          </div>
        </form>
      )}

      <section className="traslados__historial" aria-labelledby="traslados-historial-titulo">
        <div className="traslados__historial-cabecera">
          <div>
            <h2 id="traslados-historial-titulo">Traslados recientes</h2>
            <p>Incluye todos los envíos en tránsito y los 100 recibidos más recientes.</p>
          </div>
          <button className="btn btn--secondary" type="button" onClick={() => transferencias.refetch()} disabled={transferencias.isFetching}>
            {transferencias.isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
        {transferencias.isLoading && <EmptyState loading title="Consultando traslados…" />}
        {transferencias.isError && (
          <EmptyState icon="alerta" title="No se pudo cargar el historial de traslados.">
            <button className="btn btn--secondary" type="button" onClick={() => transferencias.refetch()}>Reintentar</button>
          </EmptyState>
        )}
        {!transferencias.isLoading && !transferencias.isError && transferencias.data?.length === 0 && (
          <div className="card"><EmptyState title="Todavía no hay traslados registrados." /></div>
        )}
        {!transferencias.isLoading && !transferencias.isError && transferencias.data?.length > 0 && (
          <div className="traslados__lista">
            {transferencias.data.map((documento) => {
              const recibido = Boolean(documento.traslado_confirmado_en);
              return (
                <article
                  className="card traslados__tarjeta"
                  key={documento.id}
                  data-imprimir={documentoImpresion === documento.id ? 'true' : 'false'}
                >
                  <header className="traslados__tarjeta-cabecera">
                    <div>
                      <span className={`traslados__estado${recibido ? ' traslados__estado--recibido' : ''}`}>
                        {recibido ? 'Recibido' : 'En tránsito'}
                      </span>
                      <h3>{documento.numero}</h3>
                      <p>{fechaHora(documento.fecha)} · enviado por {documento.creador}</p>
                    </div>
                  </header>
                  {documento.motivo && <p className="traslados__nota"><strong>Nota:</strong> {documento.motivo}</p>}
                  {documento.es_contingencia && <p className="traslados__contingencia-marca">Digitalización de un registro de contingencia en papel</p>}
                  <div className="traslados__lineas">
                    <h4>Productos</h4>
                    {documento.lineas.length > 0 ? (
                      <ul>{documento.lineas.map((linea) => <LineaTraslado key={linea.id} linea={linea} />)}</ul>
                    ) : <p>No se encontraron líneas para este documento.</p>}
                  </div>
                  {recibido && (
                    <p className="traslados__recepcion">Recibido {fechaHora(documento.traslado_confirmado_en)} por {documento.receptor || 'usuario no disponible'}.</p>
                  )}
                  <footer className="traslados__tarjeta-acciones">
                    {!recibido && (
                      <button
                        className="btn btn--primary"
                        type="button"
                        onClick={() => recibirTraslado(documento)}
                        disabled={confirmarTraslado.isPending}
                      >
                        {confirmarTraslado.isPending && confirmarTraslado.variables?.p_documento_id === documento.id ? 'Confirmando…' : 'Confirmar recepción'}
                      </button>
                    )}
                    <button className="btn btn--secondary traslados__boton-imprimir" type="button" onClick={() => setDocumentoImpresion(documento.id)}>
                      Imprimir
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
