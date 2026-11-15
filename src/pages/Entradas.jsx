import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useCatalogoEntradas, useDetalleOrdenEntrada, useDocumentoVentaOriginal, useExistenciasIniciales, useRegistrarMovimiento } from '../hooks/useEntradas.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/entradas.css';

const vacio = { cajas: '', piezas: '', cantidad: '', observacion: '' };
const TIPOS_DOCUMENTO_VENTA = [
  ['factura', 'Factura'],
  ['ccf', 'CCF'],
  ['recibo', 'Recibo'],
];

function cantidadCapturada(producto, valores) {
  return producto.tipo === 'piso'
    ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
    : Number(valores.cantidad) || 0;
}

function capturaValida(producto, valores) {
  const cantidad = cantidadCapturada(producto, valores);
  if (producto.tipo === 'piso') {
    const cajas = Number(valores.cajas) || 0;
    const piezas = Number(valores.piezas) || 0;
    if (!Number.isInteger(cajas) || !Number.isInteger(piezas)
      || cajas < 0 || piezas < 0 || piezas >= producto.piezas_por_caja) return false;
  }
  return Number.isInteger(cantidad) && cantidad > 0;
}

function CampoContingencia({ checked, onChange, disabled }) {
  return (
    <label className="entradas__contingencia">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>
        <strong>Registro de contingencia en papel</strong>
        <small>Marca si este movimiento se documentó en papel y se digitaliza el mismo día.</small>
      </span>
    </label>
  );
}

function CapturaCantidad({ producto, valores, prefijo, deshabilitado, alCambiar }) {
  const cantidad = producto.tipo === 'piso'
    ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
    : Number(valores.cantidad) || 0;

  return (
    <div className="entradas__captura">
      {producto.tipo === 'piso' ? (
        <>
          <label className="field">
            <span className="field__label">Cajas</span>
            <input
              id={`${prefijo}-cajas`}
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={valores.cajas}
              onChange={(event) => alCambiar('cajas', event.target.value)}
              disabled={deshabilitado}
            />
          </label>
          <label className="field">
            <span className="field__label">Piezas sueltas</span>
            <input
              id={`${prefijo}-piezas`}
              className="input"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={valores.piezas}
              onChange={(event) => alCambiar('piezas', event.target.value)}
              disabled={deshabilitado}
            />
          </label>
        </>
      ) : (
        <label className="field">
          <span className="field__label">Cantidad ({producto.unidad})</span>
          <input
            id={`${prefijo}-cantidad`}
            className="input"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={valores.cantidad}
            onChange={(event) => alCambiar('cantidad', event.target.value)}
            disabled={deshabilitado}
          />
        </label>
      )}
      <p className="entradas__cantidad-resumen">
        {cantidad > 0 ? formatoStock(cantidad, producto) : 'Sin cantidad registrada'}
      </p>
    </div>
  );
}

function explicarError(error) {
  if (error?.code === 'P0001') return error.message;
  if (error?.code === '23505') return 'El documento ya está registrado. Revisa el número de factura o recibo.';
  return 'No se pudo registrar la entrada. Actualiza los datos e inténtalo de nuevo.';
}

export default function Entradas() {
  const {
    data: catalogo,
    isLoading: cargandoCatalogo,
    isError: errorCatalogo,
    refetch: recargarCatalogo,
  } = useCatalogoEntradas();
  const [modo, setModo] = useState('compra');
  const [esContingencia, setEsContingencia] = useState(false);
  const [tipoDocumentoVenta, setTipoDocumentoVenta] = useState('factura');
  const [numeroDocumentoVenta, setNumeroDocumentoVenta] = useState('');
  const [motivoDevolucion, setMotivoDevolucion] = useState('');
  const [ordenId, setOrdenId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [numeroProveedor, setNumeroProveedor] = useState('');
  const [lineasCompra, setLineasCompra] = useState({});
  const [cantidadesIniciales, setCantidadesIniciales] = useState({});
  const [cantidadesDevolucion, setCantidadesDevolucion] = useState({});
  const [busquedaInicial, setBusquedaInicial] = useState('');
  const [busquedaDevolucion, setBusquedaDevolucion] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const registrar = useRegistrarMovimiento();
  const documentoVenta = useDocumentoVentaOriginal(
    modo === 'devolucion' ? tipoDocumentoVenta : null,
    numeroDocumentoVenta,
  );

  const ubicaciones = catalogo?.ubicaciones || [];
  const ubicacionSeleccionada = Number(ubicacionId) || ubicaciones[0]?.id;
  const ordenSeleccionada = (catalogo?.ordenes || []).find((orden) => orden.id === Number(ordenId));
  const {
    data: detalleOrden = [],
    isLoading: cargandoDetalle,
    isError: errorDetalle,
    refetch: recargarDetalle,
  } = useDetalleOrdenEntrada(ordenId);
  const {
    data: existencias = [],
    isLoading: cargandoExistencias,
    isError: errorExistencias,
    refetch: recargarExistencias,
  } = useExistenciasIniciales(ubicacionSeleccionada);
  const productosConSaldo = useMemo(
    () => new Map(existencias.map((existencia) => [existencia.producto_id, existencia.cantidad])),
    [existencias],
  );

  const detallesRecepcion = detalleOrden.map((detalle) => {
    const valores = lineasCompra[detalle.id] || vacio;
    const producto = detalle.producto;
    const cantidad = !producto ? 0 : producto.tipo === 'piso'
      ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
      : Number(valores.cantidad) || 0;
    const restante = Math.max(detalle.cantidad - detalle.cantidad_recibida, 0);
    return { ...detalle, valores, cantidad, restante };
  });
  const seleccionadosRecepcion = detallesRecepcion.filter((detalle) => detalle.cantidad > 0);
  const recepcionValida = seleccionadosRecepcion.length > 0 && seleccionadosRecepcion.every((detalle) => (
    Number.isInteger(detalle.cantidad)
      && (detalle.cantidad <= detalle.restante || Boolean(detalle.valores.observacion.trim()))
  ));

  const productosIniciales = (catalogo?.productos || []).filter((producto) => {
    const texto = `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es');
    return texto.includes(busquedaInicial.trim().toLocaleLowerCase('es'));
  });
  const seleccionadosIniciales = (catalogo?.productos || []).filter((producto) => {
    const valores = cantidadesIniciales[producto.id] || vacio;
    const cantidad = producto.tipo === 'piso'
      ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
      : Number(valores.cantidad) || 0;
    return cantidad > 0;
  });
  const inicialValido = seleccionadosIniciales.length > 0 && seleccionadosIniciales.every((producto) => {
    const valores = cantidadesIniciales[producto.id] || vacio;
    const cantidad = producto.tipo === 'piso'
      ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
      : Number(valores.cantidad) || 0;
    return Number.isInteger(cantidad) && cantidad > 0 && !productosConSaldo.has(producto.id);
  });
  const seleccionadosDevolucion = (catalogo?.productos || []).filter((producto) => (
    cantidadCapturada(producto, cantidadesDevolucion[producto.id] || vacio) > 0
  ));
  const productosDevolucion = (catalogo?.productos || []).filter((producto) => (
    `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es').includes(busquedaDevolucion.trim().toLocaleLowerCase('es'))
  ));
  const devolucionValida = seleccionadosDevolucion.length > 0 && seleccionadosDevolucion.every((producto) => (
    capturaValida(producto, cantidadesDevolucion[producto.id] || vacio)
  ));

  function actualizarLineaCompra(id, campo, valor) {
    setLineasCompra((anteriores) => ({
      ...anteriores,
      [id]: { ...vacio, ...anteriores[id], [campo]: valor },
    }));
  }

  function actualizarCantidadInicial(id, campo, valor) {
    setCantidadesIniciales((anteriores) => ({
      ...anteriores,
      [id]: { ...vacio, ...anteriores[id], [campo]: valor },
    }));
  }

  function actualizarCantidadDevolucion(id, campo, valor) {
    setCantidadesDevolucion((anteriores) => ({
      ...anteriores,
      [id]: { ...vacio, ...anteriores[id], [campo]: valor },
    }));
  }

  function cambiarModo(siguiente) {
    setModo(siguiente);
    setEsContingencia(false);
    setMensaje(null);
  }

  async function registrarRecepcion(event) {
    event.preventDefault();
    if (!recepcionValida || !ordenSeleccionada || !ubicacionSeleccionada) return;
    setMensaje(null);
    const detalles = seleccionadosRecepcion.map((detalle) => ({
      producto_id: detalle.producto_id,
      cantidad: detalle.cantidad,
      ubicacion_destino_id: ubicacionSeleccionada,
      detalle_orden_pedido_id: detalle.id,
      observacion: detalle.valores.observacion.trim() || null,
    }));
    try {
      await registrar.mutateAsync({
        tipo: 'entrada_compra',
        cabecera: {
          orden_pedido_id: ordenSeleccionada.id,
          doc_proveedor_numero: numeroProveedor.trim(),
          es_contingencia: esContingencia,
        },
        detalles,
      });
      setNumeroProveedor('');
      setLineasCompra({});
      setOrdenId('');
      setEsContingencia(false);
      setMensaje({ tipo: 'exito', texto: 'Recepción registrada y existencias actualizadas.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function registrarInventarioInicial(event) {
    event.preventDefault();
    if (!inicialValido || !ubicacionSeleccionada) return;
    setMensaje(null);
    const detalles = seleccionadosIniciales.map((producto) => {
      const valores = cantidadesIniciales[producto.id] || vacio;
      const cantidad = producto.tipo === 'piso'
        ? aPiezas(valores.cajas, valores.piezas, producto.piezas_por_caja)
        : Number(valores.cantidad);
      return {
        producto_id: producto.id,
        cantidad,
        ubicacion_destino_id: ubicacionSeleccionada,
      };
    });
    try {
      await registrar.mutateAsync({
        tipo: 'inventario_inicial',
        cabecera: { motivo: 'Carga inicial del inventario físico', es_contingencia: esContingencia },
        detalles,
      });
      setCantidadesIniciales({});
      setEsContingencia(false);
      setMensaje({ tipo: 'exito', texto: 'Inventario inicial registrado y existencias actualizadas.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  async function registrarDevolucionCliente(event) {
    event.preventDefault();
    if (!devolucionValida || !documentoVenta.data || !motivoDevolucion.trim() || !ubicacionSeleccionada) return;
    setMensaje(null);
    const detalles = seleccionadosDevolucion.map((producto) => ({
      producto_id: producto.id,
      cantidad: cantidadCapturada(producto, cantidadesDevolucion[producto.id] || vacio),
      ubicacion_destino_id: ubicacionSeleccionada,
    }));
    try {
      await registrar.mutateAsync({
        tipo: 'entrada_devolucion_cliente',
        cabecera: {
          documento_origen_id: documentoVenta.data.id,
          doc_venta_tipo: tipoDocumentoVenta,
          doc_venta_numero: numeroDocumentoVenta.trim(),
          motivo: motivoDevolucion.trim(),
          es_contingencia: esContingencia,
        },
        detalles,
      });
      setNumeroDocumentoVenta('');
      setMotivoDevolucion('');
      setCantidadesDevolucion({});
      setEsContingencia(false);
      setMensaje({ tipo: 'exito', texto: 'Devolución registrada y vinculada al comprobante original.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  return (
    <section className="pagina">
      <header className="pagina__encabezado">
        <div>
          <h1>Entradas</h1>
          <p>Registra recepciones y existencias iniciales en unidad base.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`entradas__mensaje entradas__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      <div className="entradas__pestanas" role="group" aria-label="Tipo de entrada">
        <button
          type="button"
          aria-pressed={modo === 'compra'}
          className={`btn ${modo === 'compra' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => cambiarModo('compra')}
          disabled={registrar.isPending}
        >
          Recepción de compra
        </button>
        <button
          type="button"
          aria-pressed={modo === 'inicial'}
          className={`btn ${modo === 'inicial' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => cambiarModo('inicial')}
          disabled={registrar.isPending}
        >
          Inventario inicial
        </button>
        <button
          type="button"
          aria-pressed={modo === 'devolucion'}
          className={`btn ${modo === 'devolucion' ? 'btn--primary' : 'btn--secondary'}`}
          onClick={() => cambiarModo('devolucion')}
          disabled={registrar.isPending}
        >
          Devolución de cliente
        </button>
      </div>

      {cargandoCatalogo && <EmptyState loading title="Consultando productos y ubicaciones…" />}
      {errorCatalogo && (
        <EmptyState icon="alerta" title="No se pudieron cargar productos y ubicaciones.">
          <button className="btn btn--secondary" type="button" onClick={() => recargarCatalogo()}>Reintentar</button>
        </EmptyState>
      )}
      {!cargandoCatalogo && !errorCatalogo && ubicaciones.length === 0 && (
        <div className="card">
          <EmptyState icon="ubicacion" title="No hay una bodega principal activa.">
            <p>Solicita a administración que active una ubicación de tipo bodega.</p>
          </EmptyState>
        </div>
      )}

      {!cargandoCatalogo && !errorCatalogo && ubicaciones.length > 0 && modo === 'compra' && (
        <form className="card entradas__formulario" onSubmit={registrarRecepcion}>
          <div className="entradas__formulario-cabecera">
            <h2>Recepción de compra</h2>
            <p>Las recepciones parciales actualizan el avance de la orden y las diferencias se anotan por producto.</p>
          </div>

          <div className="entradas__cabecera-campos">
            <label className="field">
              <span className="field__label">Orden de pedido</span>
              <select
                className="input"
                required
                value={ordenId}
                onChange={(event) => {
                  setOrdenId(event.target.value);
                  setLineasCompra({});
                }}
                disabled={registrar.isPending}
              >
                <option value="">Selecciona una orden abierta</option>
                {(catalogo?.ordenes || []).map((orden) => (
                  <option key={orden.id} value={orden.id}>
                    {orden.numero} · {orden.proveedor} · {orden.estado}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Factura o remisión del proveedor</span>
              <input
                className="input"
                required
                maxLength={100}
                value={numeroProveedor}
                onChange={(event) => setNumeroProveedor(event.target.value)}
                disabled={registrar.isPending}
              />
            </label>
            <label className="field">
              <span className="field__label">Recibir en</span>
              <select
                className="input"
                value={ubicacionSeleccionada || ''}
                onChange={(event) => setUbicacionId(event.target.value)}
                disabled={registrar.isPending}
              >
                {ubicaciones.map((ubicacion) => (
                  <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          <CampoContingencia checked={esContingencia} onChange={setEsContingencia} disabled={registrar.isPending} />

          {!ordenId && <EmptyState icon="cart" title="Selecciona una orden para cargar sus productos." />}
          {ordenId && cargandoDetalle && <EmptyState loading title="Consultando productos de la orden…" />}
          {ordenId && errorDetalle && (
            <EmptyState icon="alerta" title="No se pudieron cargar las líneas de la orden.">
              <button className="btn btn--secondary" type="button" onClick={() => recargarDetalle()}>Reintentar</button>
            </EmptyState>
          )}
          {ordenId && !cargandoDetalle && !errorDetalle && detalleOrden.length === 0 && (
            <EmptyState icon="alerta" title="La orden no tiene productos para recibir." />
          )}

          {ordenId && !cargandoDetalle && !errorDetalle && detalleOrden.length > 0 && (
            <div className="entradas__productos">
              {ordenSeleccionada && (
                <div className="entradas__orden-info">
                  <strong>{ordenSeleccionada.proveedor}</strong>
                  <span>{ordenSeleccionada.numero} · {ordenSeleccionada.estado}</span>
                </div>
              )}
              {detallesRecepcion.map((detalle) => {
                const producto = detalle.producto;
                if (!producto) return null;
                const prefijo = `recepcion-${detalle.id}`;
                return (
                  <article className="entradas__producto" key={detalle.id}>
                    <header>
                      <div>
                        <h3>{producto.nombre}</h3>
                        <p>{producto.codigo}</p>
                      </div>
                      <p className="entradas__pedido-resumen">
                        Pedido {formatoStock(detalle.cantidad, producto)} · Recibido {formatoStock(detalle.cantidad_recibida, producto)}
                      </p>
                    </header>
                    <CapturaCantidad
                      producto={producto}
                      valores={detalle.valores}
                      prefijo={prefijo}
                      deshabilitado={registrar.isPending}
                      alCambiar={(campo, valor) => actualizarLineaCompra(detalle.id, campo, valor)}
                    />
                    {detalle.cantidad > detalle.restante && detalle.cantidad > 0 && (
                      <p className="entradas__aviso">
                        La recepción supera lo pendiente. Registra la diferencia u observación para continuar.
                      </p>
                    )}
                    <label className="field">
                      <span className="field__label">Diferencia u observación</span>
                      <input
                        className="input"
                        maxLength={300}
                        value={detalle.valores.observacion}
                        onChange={(event) => actualizarLineaCompra(detalle.id, 'observacion', event.target.value)}
                        placeholder="Faltante, sobrante, material dañado…"
                        disabled={registrar.isPending}
                      />
                    </label>
                  </article>
                );
              })}
            </div>
          )}

          <div className="entradas__acciones">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={registrar.isPending || !ordenId || !numeroProveedor.trim() || !recepcionValida}
            >
              {registrar.isPending ? 'Registrando…' : 'Registrar recepción'}
            </button>
          </div>
        </form>
      )}

      {!cargandoCatalogo && !errorCatalogo && ubicaciones.length > 0 && modo === 'inicial' && (
        <form className="card entradas__formulario" onSubmit={registrarInventarioInicial}>
          <div className="entradas__formulario-cabecera">
            <h2>Cargar inventario inicial</h2>
            <p>Captura las existencias físicas por producto. El sistema guarda piezas y unidades, no metros cuadrados.</p>
          </div>
          <div className="entradas__cabecera-campos entradas__cabecera-campos--inicial">
            <label className="field">
              <span className="field__label">Ubicación</span>
              <select
                className="input"
                value={ubicacionSeleccionada || ''}
                onChange={(event) => setUbicacionId(event.target.value)}
                disabled={registrar.isPending}
              >
                {ubicaciones.map((ubicacion) => (
                  <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Buscar producto</span>
              <input
                className="input"
                type="search"
                value={busquedaInicial}
                onChange={(event) => setBusquedaInicial(event.target.value)}
                placeholder="Código o nombre"
              />
            </label>
          </div>

          <CampoContingencia checked={esContingencia} onChange={setEsContingencia} disabled={registrar.isPending} />

          {cargandoExistencias && <EmptyState loading title="Consultando saldos actuales…" />}
          {errorExistencias && (
            <EmptyState icon="alerta" title="No se pudieron consultar los saldos actuales.">
              <button className="btn btn--secondary" type="button" onClick={() => recargarExistencias()}>Reintentar</button>
            </EmptyState>
          )}
          {!cargandoExistencias && !errorExistencias && productosIniciales.length === 0 && (
            <EmptyState icon="search" title="No hay productos que coincidan con la búsqueda." />
          )}
          {!cargandoExistencias && !errorExistencias && productosIniciales.length > 0 && (
            <div className="entradas__productos">
              {productosIniciales.map((producto) => {
                const existencia = productosConSaldo.get(producto.id) || 0;
                const valores = cantidadesIniciales[producto.id] || vacio;
                return (
                  <article className={`entradas__producto${existencia > 0 ? ' entradas__producto--existente' : ''}`} key={producto.id}>
                    <header>
                      <div>
                        <h3>{producto.nombre}</h3>
                        <p>{producto.codigo}</p>
                      </div>
                      <p className="entradas__pedido-resumen">
                        {existencia > 0 ? `Ya existe: ${formatoStock(existencia, producto)}` : 'Sin saldo registrado'}
                      </p>
                    </header>
                    {existencia > 0 ? (
                      <p className="entradas__ayuda">Para corregir una existencia usa un ajuste autorizado.</p>
                    ) : (
                      <CapturaCantidad
                        producto={producto}
                        valores={valores}
                        prefijo={`inicial-${producto.id}`}
                        deshabilitado={registrar.isPending}
                        alCambiar={(campo, valor) => actualizarCantidadInicial(producto.id, campo, valor)}
                      />
                    )}
                  </article>
                );
              })}
            </div>
          )}
          <div className="entradas__acciones">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={registrar.isPending || cargandoExistencias || errorExistencias || !inicialValido}
            >
              {registrar.isPending ? 'Registrando…' : 'Guardar inventario inicial'}
            </button>
          </div>
        </form>
      )}

      {!cargandoCatalogo && !errorCatalogo && ubicaciones.length > 0 && modo === 'devolucion' && (
        <form className="card entradas__formulario" onSubmit={registrarDevolucionCliente}>
          <div className="entradas__formulario-cabecera">
            <h2>Devolución de cliente</h2>
            <p>Relaciona la entrada con la venta aprobada. El sistema valida el producto y la cantidad acumulada contra la salida original.</p>
          </div>
          <div className="entradas__cabecera-campos">
            <label className="field">
              <span className="field__label">Tipo de comprobante original</span>
              <select className="input" value={tipoDocumentoVenta} onChange={(event) => setTipoDocumentoVenta(event.target.value)} disabled={registrar.isPending}>
                {TIPOS_DOCUMENTO_VENTA.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Número de comprobante original</span>
              <input
                className="input"
                required
                maxLength={100}
                value={numeroDocumentoVenta}
                onChange={(event) => setNumeroDocumentoVenta(event.target.value)}
                disabled={registrar.isPending}
              />
            </label>
            <label className="field">
              <span className="field__label">Recibir en</span>
              <select className="input" value={ubicacionSeleccionada || ''} onChange={(event) => setUbicacionId(event.target.value)} disabled={registrar.isPending}>
                {ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </label>
            <label className="field entradas__motivo-devolucion">
              <span className="field__label">Motivo de la devolución</span>
              <textarea className="input" rows="2" maxLength={500} required value={motivoDevolucion} onChange={(event) => setMotivoDevolucion(event.target.value)} disabled={registrar.isPending} />
            </label>
          </div>

          <CampoContingencia checked={esContingencia} onChange={setEsContingencia} disabled={registrar.isPending} />

          {documentoVenta.isLoading && <EmptyState loading title="Verificando comprobante original…" />}
          {documentoVenta.isError && (
            <EmptyState icon="alerta" title="No se pudo verificar la salida original.">
              <button className="btn btn--secondary" type="button" onClick={() => documentoVenta.refetch()}>Reintentar</button>
            </EmptyState>
          )}
          {numeroDocumentoVenta.trim() && !documentoVenta.isLoading && !documentoVenta.isError && !documentoVenta.data && (
            <p className="entradas__aviso" role="status">No se encontró una salida aprobada con ese tipo y número de comprobante.</p>
          )}
          {documentoVenta.data && (
            <p className="entradas__aviso" role="status">
              Venta vinculada: {documentoVenta.data.serie}-{documentoVenta.data.anio}-{String(documentoVenta.data.correlativo).padStart(5, '0')}.
            </p>
          )}

          <div className="entradas__cabecera-campos entradas__cabecera-campos--inicial">
            <label className="field">
              <span className="field__label">Buscar producto</span>
              <input className="input" type="search" value={busquedaDevolucion} onChange={(event) => setBusquedaDevolucion(event.target.value)} placeholder="Código o nombre" disabled={registrar.isPending} />
            </label>
          </div>
          {documentoVenta.data && (
            <div className="entradas__productos">
              {productosDevolucion.map((producto) => (
                <article className="entradas__producto" key={producto.id}>
                  <header>
                    <div>
                      <h3>{producto.nombre}</h3>
                      <p>{producto.codigo}</p>
                    </div>
                  </header>
                  <CapturaCantidad
                    producto={producto}
                    valores={cantidadesDevolucion[producto.id] || vacio}
                    prefijo={`devolucion-${producto.id}`}
                    deshabilitado={registrar.isPending}
                    alCambiar={(campo, valor) => actualizarCantidadDevolucion(producto.id, campo, valor)}
                  />
                </article>
              ))}
            </div>
          )}
          {documentoVenta.data && productosDevolucion.length === 0 && (
            <EmptyState icon="search" title="No hay productos que coincidan con la búsqueda." />
          )}
          <div className="entradas__acciones">
            <button
              className="btn btn--primary"
              type="submit"
              disabled={registrar.isPending || !documentoVenta.data || !devolucionValida || !motivoDevolucion.trim() || documentoVenta.isFetching}
            >
              {registrar.isPending ? 'Registrando…' : 'Registrar devolución'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
