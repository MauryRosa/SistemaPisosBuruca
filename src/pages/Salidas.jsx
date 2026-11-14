import { useEffect, useMemo, useRef, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import {
  useCatalogoSalidas,
  useRegistrarAperturaCaja,
  useRegistrarSalida,
  useDocumentoSalida,
  useReservasPorVenta,
  useStockSalida,
} from '../hooks/useSalidas.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/salidas.css';

const VACIO = { cajas: '', piezas: '', cantidad: '' };
const TIPOS_SALIDA = [
  { id: 'salida_venta', texto: 'Venta desde bodega' },
  { id: 'despacho_minibodega', texto: 'Despacho desde minibodega' },
  { id: 'merma', texto: 'Merma o daño' },
  { id: 'consumo_interno', texto: 'Consumo interno' },
  { id: 'devolucion_proveedor', texto: 'Devolución a proveedor' },
  { id: 'entrada_cambio', texto: 'Cambio o garantía' },
  { id: 'apertura_caja', texto: 'Apertura de cajas' },
  { id: 'ajuste_negativo', texto: 'Ajuste negativo' },
];
const TIPOS_VENTA = [
  { id: 'factura', texto: 'Factura' },
  { id: 'ccf', texto: 'CCF' },
  { id: 'recibo', texto: 'Recibo' },
];
const NOMBRES_MOVIMIENTO = {
  salida_venta: 'Orden de salida por venta',
  despacho_minibodega: 'Orden de despacho desde minibodega',
};

function cantidadProducto(producto, valor) {
  return producto.tipo === 'piso'
    ? aPiezas(valor?.cajas, valor?.piezas, producto.piezas_por_caja)
    : Number(valor?.cantidad) || 0;
}

function disponibles(saldo, reservaPropia = 0) {
  return Math.max((Number(saldo?.fisico) || 0) - (Number(saldo?.reservado) || 0) + reservaPropia, 0);
}

function cajasDisponibles(producto, saldo) {
  return producto.piezas_por_caja > 0
    ? Math.floor(disponibles(saldo) / producto.piezas_por_caja)
    : 0;
}

function explicarError(error) {
  if (error?.code === 'P0001') return error.message;
  if (error?.code === '23505') return 'El número de factura, CCF o recibo ya está ligado a otra salida.';
  if (error?.message?.includes('Adjunta') || error?.message?.includes('superar 10 MB')) return error.message;
  return 'No se pudo registrar la salida. Actualiza el saldo e inténtalo de nuevo.';
}

function fechaHoraDocumento(valor) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

function numeroDocumento(documento) {
  return `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`;
}

function CampoContingencia({ checked, onChange, disabled }) {
  return (
    <label className="salidas__contingencia">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>
        <strong>Registro de contingencia en papel</strong>
        <small>Marca si este movimiento se documentó en papel y se digitaliza el mismo día.</small>
      </span>
    </label>
  );
}

function CapturaCantidad({ producto, valor, disponible, reservaPropia, deshabilitado, aplicaModoDespacho, onChange }) {
  const cantidad = cantidadProducto(producto, valor);
  const excede = cantidad > disponible;
  const modoDespacho = aplicaModoDespacho ? producto.despacho_por || 'ambos' : 'ambos';
  const mostrarCajas = modoDespacho !== 'pieza';
  const mostrarPiezas = modoDespacho !== 'caja';
  return (
    <div className="salidas__captura">
      {producto.tipo === 'piso' ? (
        <>
          {mostrarCajas && (
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
          )}
          {mostrarPiezas && (
            <label className="field">
              <span className="field__label">{modoDespacho === 'pieza' ? 'Piezas' : 'Piezas sueltas'}</span>
              <input
                className="input"
                type="number"
                min="0"
                {...(modoDespacho === 'ambos' ? { max: producto.piezas_por_caja - 1 } : {})}
                step="1"
                inputMode="numeric"
                value={valor?.piezas || ''}
                onChange={(event) => onChange('piezas', event.target.value)}
                disabled={deshabilitado}
                aria-label={`${modoDespacho === 'pieza' ? 'Piezas' : 'Piezas sueltas'} de ${producto.nombre}`}
              />
            </label>
          )}
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
      <p className={`salidas__disponible${excede ? ' salidas__disponible--error' : ''}`}>
        {cantidad > 0 ? `Salida: ${formatoStock(cantidad, producto)} · ` : ''}
        Disponible: {formatoStock(disponible, producto)}
        {reservaPropia > 0 ? ` · Reservado para este documento: ${formatoStock(reservaPropia, producto)}` : ''}
        {excede ? ' · Supera el saldo disponible' : ''}
      </p>
    </div>
  );
}

function ListaProductos({
  productos,
  cantidades,
  stockPorProducto,
  reservasPorProducto,
  busqueda,
  deshabilitado,
  aplicaModoDespacho = false,
  onChange,
}) {
  const filtrados = productos.filter((producto) => (
    `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ));

  if (filtrados.length === 0) return <EmptyState title="No hay productos que coincidan con la búsqueda." />;

  return (
    <div className="salidas__productos">
      {filtrados.map((producto) => {
        const reservaPropia = reservasPorProducto.get(producto.id) || 0;
        const disponible = disponibles(stockPorProducto.get(producto.id), reservaPropia);
        return (
          <article className="salidas__producto" key={producto.id}>
            <header>
              <div>
                <h4>{producto.nombre}</h4>
                <p>{producto.codigo} · {producto.tipo === 'piso' ? 'Piso' : producto.unidad}</p>
              </div>
            </header>
            {disponible > 0 ? (
              <CapturaCantidad
                producto={producto}
                valor={cantidades[producto.id] || VACIO}
                disponible={disponible}
                reservaPropia={reservaPropia}
                deshabilitado={deshabilitado}
                aplicaModoDespacho={aplicaModoDespacho}
                onChange={(campo, valor) => onChange(producto.id, campo, valor)}
              />
            ) : <p className="salidas__sin-stock">Sin saldo disponible en esta ubicación.</p>}
          </article>
        );
      })}
    </div>
  );
}

function ListaAperturaCajas({ productos, cantidades, stockPorProducto, busqueda, deshabilitado, onChange }) {
  const filtrados = productos.filter((producto) => (
    `${producto.codigo} ${producto.nombre}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ));

  if (filtrados.length === 0) return <EmptyState title="No hay pisos que coincidan con la búsqueda." />;

  return (
    <div className="salidas__productos">
      {filtrados.map((producto) => {
        const cajas = cajasDisponibles(producto, stockPorProducto.get(producto.id));
        return (
          <article className="salidas__producto" key={producto.id}>
            <header>
              <div>
                <h4>{producto.nombre}</h4>
                <p>{producto.codigo} · {producto.piezas_por_caja} piezas por caja</p>
              </div>
            </header>
            {cajas > 0 ? (
              <label className="field salidas__cajas-apertura">
                <span className="field__label">Cajas que se abren · disponibles: {cajas}</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max={cajas}
                  step="1"
                  inputMode="numeric"
                  value={cantidades[producto.id] || ''}
                  onChange={(event) => onChange(producto.id, event.target.value)}
                  disabled={deshabilitado}
                  aria-label={`Cajas por abrir de ${producto.nombre}`}
                />
              </label>
            ) : <p className="salidas__sin-stock">No hay una caja completa disponible en esta ubicación.</p>}
          </article>
        );
      })}
    </div>
  );
}

function evidenciaRequerida(tipo) {
  return ['salida_venta', 'despacho_minibodega', 'merma'].includes(tipo);
}

export default function Salidas() {
  const [tipo, setTipo] = useState('salida_venta');
  const [ubicacionId, setUbicacionId] = useState('');
  const [tipoVenta, setTipoVenta] = useState('factura');
  const [numeroVenta, setNumeroVenta] = useState('');
  const [retira, setRetira] = useState('');
  const [placa, setPlaca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [compraOrigenId, setCompraOrigenId] = useState('');
  const [numeroProveedor, setNumeroProveedor] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [cantidadesCambioEntrada, setCantidadesCambioEntrada] = useState({});
  const [cantidadesApertura, setCantidadesApertura] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [esContingencia, setEsContingencia] = useState(false);
  const [comprobanteId, setComprobanteId] = useState(null);
  const [impresionActiva, setImpresionActiva] = useState(false);
  const archivoRef = useRef(null);

  const catalogo = useCatalogoSalidas();
  const ubicaciones = catalogo.data?.ubicaciones || [];
  const tipoUbicacion = tipo === 'despacho_minibodega' ? 'minibodega' : 'bodega';
  const origenes = ubicaciones.filter((ubicacion) => ubicacion.tipo === tipoUbicacion);
  const origenActual = origenes.find((ubicacion) => ubicacion.id === Number(ubicacionId)) || origenes[0];
  const stockQuery = useStockSalida(origenActual?.id);
  const reservarQuery = useReservasPorVenta(
    ['salida_venta', 'despacho_minibodega'].includes(tipo) ? tipoVenta : null,
    numeroVenta,
    origenActual?.id,
  );
  const registrar = useRegistrarSalida();
  const registrarApertura = useRegistrarAperturaCaja();
  const comprobante = useDocumentoSalida(comprobanteId);
  const operacionPendiente = registrar.isPending || registrarApertura.isPending;

  useEffect(() => {
    if (!impresionActiva) return;
    window.print();
    setImpresionActiva(false);
  }, [impresionActiva]);
  const stockPorProducto = useMemo(
    () => new Map((stockQuery.data || []).map((fila) => [fila.producto_id, fila])),
    [stockQuery.data],
  );
  const reservasPorProducto = useMemo(() => {
    const total = new Map();
    for (const reserva of reservarQuery.data || []) {
      total.set(reserva.producto_id, (total.get(reserva.producto_id) || 0) + reserva.cantidad);
    }
    return total;
  }, [reservarQuery.data]);

  const requiereDocumentoVenta = ['salida_venta', 'despacho_minibodega', 'entrada_cambio'].includes(tipo);
  const requiereEvidencia = evidenciaRequerida(tipo);
  const aplicaModoDespacho = ['salida_venta', 'despacho_minibodega', 'entrada_cambio'].includes(tipo);
  const requiereMotivo = ['merma', 'consumo_interno', 'ajuste_negativo'].includes(tipo);
  const compraSeleccionada = (catalogo.data?.compras || []).find((compra) => compra.id === Number(compraOrigenId));
  const cantidadesSalida = (catalogo.data?.productos || []).filter((producto) => cantidadProducto(producto, cantidades[producto.id]) > 0);
  const cantidadesEntrada = (catalogo.data?.productos || []).filter((producto) => cantidadProducto(producto, cantidadesCambioEntrada[producto.id]) > 0);
  const productosPiso = (catalogo.data?.productos || []).filter((producto) => producto.tipo === 'piso');
  const productosApertura = productosPiso.filter((producto) => Number(cantidadesApertura[producto.id]) > 0);
  const aperturaValida = productosApertura.length > 0 && productosApertura.every((producto) => {
    const cajas = Number(cantidadesApertura[producto.id]);
    return Number.isInteger(cajas) && cajas > 0 && cajas <= cajasDisponibles(producto, stockPorProducto.get(producto.id));
  });

  function actualizarCampo(setCantidadesObjetivo, anterior, productoId, campo, valor) {
    setCantidadesObjetivo((estado) => ({
      ...estado,
      [productoId]: { ...VACIO, ...estado[productoId], [campo]: valor },
    }));
    if (anterior) anterior();
  }

  function cambiarTipo(nuevoTipo) {
    setTipo(nuevoTipo);
    setUbicacionId('');
    setCantidades({});
    setCantidadesCambioEntrada({});
    setCantidadesApertura({});
    setComprobanteId(null);
    setEsContingencia(false);
    setArchivo(null);
    if (archivoRef.current) archivoRef.current.value = '';
    setMensaje(null);
  }

  function validarCantidad(producto, valor, validarModoDespacho = false) {
    const cantidad = cantidadProducto(producto, valor);
    const piezas = Number(valor?.piezas) || 0;
    const cajas = Number(valor?.cajas) || 0;
    if (producto.tipo === 'piso' && (
      !Number.isInteger(cajas)
      || !Number.isInteger(piezas)
      || cajas < 0
      || piezas < 0
      || piezas >= producto.piezas_por_caja
    )) return false;
    if (producto.tipo === 'piso' && validarModoDespacho) {
      if (producto.despacho_por === 'caja' && (piezas > 0 || cantidad % producto.piezas_por_caja !== 0)) return false;
      if (producto.despacho_por === 'pieza' && cajas > 0) return false;
    }
    return Number.isInteger(cantidad) && cantidad > 0;
  }

  const detalleSalidaValido = cantidadesSalida.length > 0 && cantidadesSalida.every((producto) => {
    const cantidad = cantidadProducto(producto, cantidades[producto.id]);
    const disponible = disponibles(stockPorProducto.get(producto.id), reservasPorProducto.get(producto.id) || 0);
    return validarCantidad(producto, cantidades[producto.id], aplicaModoDespacho) && cantidad <= disponible;
  });
  const detalleEntradaValido = cantidadesEntrada.length > 0 && cantidadesEntrada.every((producto) => (
    validarCantidad(producto, cantidadesCambioEntrada[producto.id])
  ));
  const reservasCubiertas = [...reservasPorProducto].every(([productoId, reservada]) => (
    cantidadProducto((catalogo.data?.productos || []).find((producto) => producto.id === productoId) || { tipo: 'accesorio' }, cantidades[productoId]) >= reservada
  ));
  const documentoVentaValido = !requiereDocumentoVenta || Boolean(numeroVenta.trim());
  const evidenciaValida = !requiereEvidencia || Boolean(archivo);
  const motivoValido = !requiereMotivo || Boolean(motivo.trim());
  const devolucionValida = tipo !== 'devolucion_proveedor' || Boolean(compraSeleccionada && numeroProveedor.trim());
  const requiereEntradaCambio = tipo !== 'entrada_cambio' || detalleEntradaValido;
  const tipoSalidaTieneLineas = tipo === 'entrada_cambio'
    ? detalleSalidaValido && detalleEntradaValido
    : detalleSalidaValido;
  const formularioValido = tipo === 'apertura_caja'
    ? Boolean(origenActual)
      && aperturaValida
      && !stockQuery.isLoading
      && !stockQuery.isError
    : Boolean(origenActual)
    && tipoSalidaTieneLineas
    && documentoVentaValido
    && evidenciaValida
    && motivoValido
    && devolucionValida
    && requiereEntradaCambio
    && reservasCubiertas
    && !stockQuery.isLoading
    && !stockQuery.isError
    && (!requiereDocumentoVenta || (!reservarQuery.isLoading && !reservarQuery.isError));

  async function registrarSalida(event) {
    event.preventDefault();
    if (!origenActual) return;
    if (tipo === 'apertura_caja') {
      if (!aperturaValida || stockQuery.isLoading || stockQuery.isError) return;
      setMensaje(null);
      try {
        const id = await registrarApertura.mutateAsync({
          ubicacionId: origenActual.id,
          esContingencia,
          detalles: productosApertura.map((producto) => ({
            producto_id: producto.id,
            cantidad_cajas: Number(cantidadesApertura[producto.id]),
          })),
        });
        setCantidadesApertura({});
        setEsContingencia(false);
        setMensaje({ tipo: 'exito', texto: `Apertura ${id} registrada; el saldo de inventario se mantiene y las cajas quedan trazadas.` });
      } catch (error) {
        setMensaje({ tipo: 'error', texto: explicarError(error) });
      }
      return;
    }
    if (!formularioValido) return;
    setMensaje(null);
    let tipoMovimiento = tipo;
    let detalles;
    if (tipo === 'entrada_cambio') {
      detalles = [
        ...cantidadesEntrada.map((producto) => ({
          producto_id: producto.id,
          cantidad: cantidadProducto(producto, cantidadesCambioEntrada[producto.id]),
          ubicacion_destino_id: origenActual.id,
        })),
        ...cantidadesSalida.map((producto) => ({
          producto_id: producto.id,
          cantidad: cantidadProducto(producto, cantidades[producto.id]),
          ubicacion_origen_id: origenActual.id,
        })),
      ];
    } else {
      detalles = cantidadesSalida.map((producto) => ({
        producto_id: producto.id,
        cantidad: cantidadProducto(producto, cantidades[producto.id]),
        ubicacion_origen_id: origenActual.id,
      }));
    }

    const cabecera = {
      ...(requiereDocumentoVenta ? { doc_venta_tipo: tipoVenta, doc_venta_numero: numeroVenta.trim() } : {}),
      ...(tipo === 'salida_venta' || tipo === 'despacho_minibodega' ? { retira_nombre: retira.trim(), placa: placa.trim() || null } : {}),
      ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      ...(tipo === 'devolucion_proveedor' ? {
        documento_origen_id: compraSeleccionada.id,
        doc_proveedor_numero: numeroProveedor.trim(),
      } : {}),
      es_contingencia: esContingencia,
    };

    try {
      const id = await registrar.mutateAsync({ tipo: tipoMovimiento, cabecera, detalles, archivo });
      setCantidades({});
      setCantidadesCambioEntrada({});
      setArchivo(null);
      if (archivoRef.current) archivoRef.current.value = '';
      setNumeroVenta('');
      setRetira('');
      setPlaca('');
      setMotivo('');
      setNumeroProveedor('');
      setCompraOrigenId('');
      setEsContingencia(false);
      setComprobanteId(['salida_venta', 'despacho_minibodega'].includes(tipo) ? id : null);
      setMensaje({ tipo: 'exito', texto: `Movimiento ${id} registrado correctamente. El correlativo y el saldo se asignaron en el servidor.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  const cargando = catalogo.isLoading || stockQuery.isLoading;
  const sinUbicacion = !catalogo.isLoading && !catalogo.isError && origenes.length === 0;

  return (
    <section className="pagina salidas">
      <header className="pagina__encabezado">
        <div>
          <h1>Salidas y movimientos</h1>
          <p>Registra ventas, despachos, mermas y otros egresos con su documento y responsable.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`salidas__mensaje salidas__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {catalogo.isLoading && <EmptyState loading title="Consultando productos, ubicaciones y recepciones…" />}
      {catalogo.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el catálogo de salidas.">
          <button className="btn btn--secondary" type="button" onClick={() => catalogo.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {sinUbicacion && (
        <div className="card"><EmptyState icon="ubicacion" title={`No hay una ${tipoUbicacion} activa para este movimiento.`} /></div>
      )}

      {!catalogo.isLoading && !catalogo.isError && !sinUbicacion && (
        <form className="card salidas__formulario" onSubmit={registrarSalida}>
          <div className="salidas__campos">
            <label className="field">
              <span className="field__label">Tipo de movimiento</span>
              <select className="input" value={tipo} onChange={(event) => cambiarTipo(event.target.value)} disabled={operacionPendiente}>
                {TIPOS_SALIDA.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.texto}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">{tipo === 'apertura_caja' ? 'Ubicación de apertura' : 'Ubicación de salida'}</span>
              <select
                className="input"
                value={origenActual?.id || ''}
                onChange={(event) => {
                  setUbicacionId(event.target.value);
                  setCantidades({});
                  setCantidadesCambioEntrada({});
                  setCantidadesApertura({});
                }}
                disabled={operacionPendiente}
              >
                {origenes.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </label>

            {tipo !== 'apertura_caja' && requiereDocumentoVenta && (
              <>
                <label className="field">
                  <span className="field__label">Documento de venta</span>
                  <select className="input" value={tipoVenta} onChange={(event) => setTipoVenta(event.target.value)} disabled={operacionPendiente}>
                    {TIPOS_VENTA.map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.texto}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Número de documento</span>
                  <input className="input" required maxLength="100" value={numeroVenta} onChange={(event) => setNumeroVenta(event.target.value)} disabled={operacionPendiente} />
                </label>
              </>
            )}

            {tipo !== 'apertura_caja' && (tipo === 'salida_venta' || tipo === 'despacho_minibodega') && (
              <>
                <label className="field">
                  <span className="field__label">Quién retira</span>
                  <input className="input" required maxLength="160" value={retira} onChange={(event) => setRetira(event.target.value)} disabled={operacionPendiente} />
                </label>
                <label className="field">
                  <span className="field__label">Placa del vehículo (si aplica)</span>
                  <input className="input" maxLength="30" value={placa} onChange={(event) => setPlaca(event.target.value)} disabled={operacionPendiente} />
                </label>
              </>
            )}

            {tipo !== 'apertura_caja' && tipo === 'devolucion_proveedor' && (
              <>
                <label className="field">
                  <span className="field__label">Recepción de compra de origen</span>
                  <select className="input" required value={compraOrigenId} onChange={(event) => setCompraOrigenId(event.target.value)} disabled={operacionPendiente}>
                    <option value="">Selecciona una recepción aprobada</option>
                    {(catalogo.data?.compras || []).map((compra) => <option key={compra.id} value={compra.id}>{compra.numero} · proveedor {compra.doc_proveedor_numero}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">Factura o remisión del proveedor</span>
                  <input className="input" required maxLength="100" value={numeroProveedor} onChange={(event) => setNumeroProveedor(event.target.value)} disabled={operacionPendiente} />
                </label>
              </>
            )}

            {tipo !== 'apertura_caja' && requiereMotivo && (
              <label className="field salidas__motivo">
                <span className="field__label">Motivo</span>
                <textarea className="input" rows="2" maxLength="500" required value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={operacionPendiente} />
              </label>
            )}

            {tipo !== 'apertura_caja' && requiereEvidencia && (
              <label className="field salidas__evidencia">
                <span className="field__label">{tipo === 'merma' ? 'Carta firmada' : 'Firma o foto de entrega'}</span>
                <input
                  ref={archivoRef}
                  className="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  required
                  onChange={(event) => setArchivo(event.target.files?.[0] || null)}
                  disabled={operacionPendiente}
                />
                <span className="salidas__ayuda">JPG, PNG, WebP o PDF; máximo 10 MB. El archivo queda privado en Supabase.</span>
              </label>
            )}
          </div>

          <CampoContingencia checked={esContingencia} onChange={setEsContingencia} disabled={operacionPendiente} />

          {tipo === 'apertura_caja' ? (
            <>
              <p className="salidas__aviso">La apertura deja un registro por producto y cantidad de cajas; no modifica las piezas disponibles.</p>
              <div className="salidas__productos-cabecera">
                <div>
                  <h2>Pisos disponibles para apertura</h2>
                  <p>Solo se ofrecen cajas completas descontando las piezas reservadas.</p>
                </div>
                <label className="field salidas__busqueda">
                  <span className="field__label">Buscar producto</span>
                  <input className="input" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código o nombre" disabled={operacionPendiente} />
                </label>
              </div>
              {stockQuery.isError && (
                <EmptyState icon="alerta" title="No se pudo consultar el saldo de la ubicación.">
                  <button className="btn btn--secondary" type="button" onClick={() => stockQuery.refetch()}>Reintentar</button>
                </EmptyState>
              )}
              {!stockQuery.isError && !stockQuery.isLoading && (
                <ListaAperturaCajas
                  productos={productosPiso}
                  cantidades={cantidadesApertura}
                  stockPorProducto={stockPorProducto}
                  busqueda={busqueda}
                  deshabilitado={operacionPendiente || stockQuery.isFetching}
                  onChange={(id, valor) => setCantidadesApertura((estado) => ({ ...estado, [id]: valor }))}
                />
              )}
            </>
          ) : (
            <>
          {tipo === 'entrada_cambio' && <p className="salidas__aviso">Captura en la misma operación el producto devuelto y el producto entregado como reemplazo.</p>}
          {['salida_venta', 'despacho_minibodega'].includes(tipo) && reservarQuery.isError && (
            <p className="salidas__mensaje salidas__mensaje--error" role="alert">No se pudo revisar si el documento tiene reservas. Actualiza la página antes de registrar la salida.</p>
          )}
          {reservasPorProducto.size > 0 && !reservasCubiertas && (
            <p className="salidas__aviso" role="status">El documento tiene reservas activas: incluye cada producto reservado y cubre al menos su cantidad para liberar el saldo.</p>
          )}

          <div className="salidas__productos-cabecera">
            <div>
              <h2>{tipo === 'entrada_cambio' ? 'Productos que salen' : 'Productos'}</h2>
              <p>El saldo disponible descuenta reservas y se valida otra vez al registrar el documento.</p>
            </div>
            <label className="field salidas__busqueda">
              <span className="field__label">Buscar producto</span>
              <input className="input" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Código o nombre" disabled={operacionPendiente} />
            </label>
          </div>

          {stockQuery.isError && (
            <EmptyState icon="alerta" title="No se pudo consultar el saldo de la ubicación.">
              <button className="btn btn--secondary" type="button" onClick={() => stockQuery.refetch()}>Reintentar</button>
            </EmptyState>
          )}
          {!stockQuery.isError && !stockQuery.isLoading && (
            <ListaProductos
              productos={catalogo.data?.productos || []}
              cantidades={cantidades}
              stockPorProducto={stockPorProducto}
              reservasPorProducto={reservasPorProducto}
              busqueda={busqueda}
              deshabilitado={operacionPendiente || stockQuery.isFetching}
              aplicaModoDespacho={aplicaModoDespacho}
              onChange={(id, campo, valor) => actualizarCampo(setCantidades, null, id, campo, valor)}
            />
          )}

          {tipo === 'entrada_cambio' && (
            <section className="salidas__cambio-entrada" aria-labelledby="cambio-entrada-titulo">
              <h2 id="cambio-entrada-titulo">Producto que se recibe</h2>
              <p>Registra el producto devuelto por el cliente; ambos lados se aplican en una sola transacción.</p>
              <ListaProductos
                productos={catalogo.data?.productos || []}
                cantidades={cantidadesCambioEntrada}
                stockPorProducto={new Map()}
                reservasPorProducto={new Map()}
                busqueda={busqueda}
                deshabilitado={operacionPendiente}
                onChange={(id, campo, valor) => actualizarCampo(setCantidadesCambioEntrada, null, id, campo, valor)}
              />
            </section>
          )}

          {cargando && <EmptyState loading title="Cargando saldos…" />}
            </>
          )}
          <footer className="salidas__acciones">
            <button className="btn btn--primary" type="submit" disabled={!formularioValido || operacionPendiente || stockQuery.isFetching || (tipo !== 'apertura_caja' && reservarQuery.isFetching)}>
              {operacionPendiente ? 'Registrando…' : tipo === 'apertura_caja' ? 'Registrar apertura de cajas' : 'Registrar movimiento'}
            </button>
          </footer>
        </form>
      )}

      {comprobanteId && comprobante.isLoading && <EmptyState loading title="Preparando la orden de salida…" />}
      {comprobanteId && comprobante.isError && (
        <div className="card">
          <EmptyState icon="alerta" title="La salida quedó registrada, pero no se pudo cargar su impresión.">
            <button className="btn btn--secondary" type="button" onClick={() => comprobante.refetch()}>Reintentar</button>
          </EmptyState>
        </div>
      )}
      {comprobante.data && (
        <article className={`card salidas__comprobante${impresionActiva ? ' salidas__comprobante--imprimir' : ''}`} aria-labelledby="salidas-comprobante-titulo">
          <header className="salidas__comprobante-cabecera">
            <div>
              <h2 id="salidas-comprobante-titulo">{NOMBRES_MOVIMIENTO[comprobante.data.documento.tipo] || 'Orden de salida'}</h2>
              <p>{numeroDocumento(comprobante.data.documento)}</p>
            </div>
            <button className="btn btn--secondary" type="button" onClick={() => setImpresionActiva(true)}>
              Imprimir o guardar en PDF
            </button>
          </header>
          <dl className="salidas__comprobante-datos">
            <div><dt>Fecha y hora</dt><dd>{fechaHoraDocumento(comprobante.data.documento.fecha)}</dd></div>
            <div><dt>Documento de venta</dt><dd>{comprobante.data.documento.doc_venta_tipo?.toUpperCase()} {comprobante.data.documento.doc_venta_numero}</dd></div>
            <div><dt>Ubicación</dt><dd>{comprobante.data.detalles[0]?.origen || '—'}</dd></div>
            <div><dt>Quién retira</dt><dd>{comprobante.data.documento.retira_nombre || '—'}</dd></div>
            <div><dt>Placa</dt><dd>{comprobante.data.documento.placa || 'No indicada'}</dd></div>
            <div><dt>Registró</dt><dd>{comprobante.data.documento.creador}</dd></div>
            <div><dt>Contingencia en papel</dt><dd>{comprobante.data.documento.es_contingencia ? 'Sí' : 'No'}</dd></div>
          </dl>
          <div className="tabla-scroll">
            <table className="table salidas__comprobante-tabla">
              <thead><tr><th scope="col">Código</th><th scope="col">Producto</th><th scope="col">Cantidad</th></tr></thead>
              <tbody>{comprobante.data.detalles.map((detalle) => (
                <tr key={detalle.id}>
                  <td data-label="Código">{detalle.producto?.codigo || '—'}</td>
                  <td data-label="Producto">{detalle.producto?.nombre || 'Producto no disponible'}</td>
                  <td data-label="Cantidad">{detalle.producto ? formatoStock(detalle.cantidad, detalle.producto) : detalle.cantidad}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <footer className="salidas__comprobante-pie">
            {comprobante.data.documento.evidencia_url && <p>Evidencia de entrega adjunta en el expediente privado.</p>}
            <div><span>Firma de quien entrega</span><span>Firma de quien retira</span></div>
          </footer>
        </article>
      )}
    </section>
  );
}
