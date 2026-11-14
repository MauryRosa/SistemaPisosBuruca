import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import {
  useCancelarReserva,
  useCatalogoReservas,
  useCrearReserva,
  useReservas,
  useStockReserva,
} from '../hooks/useReservas.js';
import { aPiezas, formatoStock } from '../lib/unidades.js';
import '../css/reservas.css';

const TIPOS_VENTA = [
  { id: 'factura', texto: 'Factura' },
  { id: 'ccf', texto: 'CCF' },
  { id: 'recibo', texto: 'Recibo' },
];

function cantidadCapturada(producto, cajas, piezas, cantidad) {
  return producto?.tipo === 'piso'
    ? aPiezas(cajas, piezas, producto.piezas_por_caja)
    : Number(cantidad) || 0;
}

function mensajeError(error) {
  if (error?.code === 'P0001') return error.message;
  if (error?.code === '23505') return 'La reserva ya existe. Actualiza la lista e inténtalo de nuevo.';
  return 'No se pudo guardar la reserva. Actualiza el saldo e inténtalo de nuevo.';
}

function fechaHora(valor) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

export default function Reservas() {
  const [productoId, setProductoId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [vendedoraId, setVendedoraId] = useState('');
  const [tipoVenta, setTipoVenta] = useState('factura');
  const [numeroVenta, setNumeroVenta] = useState('');
  const [cajas, setCajas] = useState('');
  const [piezas, setPiezas] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('activa');
  const [cancelSeleccionada, setCancelSeleccionada] = useState(null);
  const [motivos, setMotivos] = useState({});
  const [mensaje, setMensaje] = useState(null);

  const catalogo = useCatalogoReservas();
  const reservasQuery = useReservas();
  const reservas = reservasQuery.data || [];
  const ubicaciones = catalogo.data?.ubicaciones || [];
  const ubicacion = ubicaciones.find((item) => item.id === Number(ubicacionId)) || ubicaciones[0];
  const producto = (catalogo.data?.productos || []).find((item) => item.id === Number(productoId));
  const stockQuery = useStockReserva(ubicacion?.id);
  const stockPorProducto = useMemo(
    () => new Map((stockQuery.data || []).map((fila) => [fila.producto_id, fila])),
    [stockQuery.data],
  );
  const saldo = stockPorProducto.get(producto?.id);
  const disponible = Math.max((Number(saldo?.fisico) || 0) - (Number(saldo?.reservado) || 0), 0);
  const total = cantidadCapturada(producto, cajas, piezas, cantidad);
  const visible = reservas.filter((reserva) => reserva.estado === estadoSeleccionado);
  const conteos = reservas.reduce((resultado, reserva) => ({
    ...resultado,
    [reserva.estado]: (resultado[reserva.estado] || 0) + 1,
  }), {});
  const cantidadValida = Boolean(producto && ubicacion && vendedoraId && numeroVenta.trim())
    && Number.isInteger(total)
    && total > 0
    && total <= disponible
    && (producto?.tipo !== 'piso' || (
      Number.isInteger(Number(cajas) || 0)
      && Number.isInteger(Number(piezas) || 0)
      && (Number(piezas) || 0) >= 0
      && (Number(piezas) || 0) < producto.piezas_por_caja
    ));

  const crear = useCrearReserva();
  const cancelar = useCancelarReserva();

  function limpiarFormulario() {
    setProductoId('');
    setVendedoraId('');
    setNumeroVenta('');
    setCajas('');
    setPiezas('');
    setCantidad('');
  }

  async function crearReserva(event) {
    event.preventDefault();
    if (!cantidadValida || !producto || !ubicacion) return;
    setMensaje(null);
    try {
      const id = await crear.mutateAsync({
        producto_id: producto.id,
        ubicacion_id: ubicacion.id,
        cantidad: total,
        vendedora_id: vendedoraId,
        doc_venta_tipo: tipoVenta,
        doc_venta_numero: numeroVenta.trim(),
      });
      limpiarFormulario();
      setMensaje({ tipo: 'exito', texto: `Reserva ${id} activa. No tiene vencimiento; se libera al despacharse o cancelarse.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  async function cancelarReserva(event, reserva) {
    event.preventDefault();
    const motivo = motivos[reserva.id]?.trim();
    if (!motivo) return;
    setMensaje(null);
    try {
      await cancelar.mutateAsync({ id: reserva.id, motivo });
      setMotivos((anteriores) => ({ ...anteriores, [reserva.id]: '' }));
      setCancelSeleccionada(null);
      setMensaje({ tipo: 'exito', texto: `Reserva ${reserva.id} cancelada y saldo liberado.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  return (
    <section className="pagina reservas">
      <header className="pagina__encabezado">
        <div>
          <h1>Reservas</h1>
          <p>Aparta saldo a solicitud de una vendedora. La reserva no vence y se libera al despacharse o cancelarse.</p>
        </div>
      </header>

      {mensaje && (
        <p className={`reservas__mensaje reservas__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {catalogo.isLoading && <EmptyState loading title="Consultando catálogo y personal…" />}
      {catalogo.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el catálogo de reservas.">
          <button className="btn btn--secondary" type="button" onClick={() => catalogo.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!catalogo.isLoading && !catalogo.isError && (ubicaciones.length === 0 || !catalogo.data?.vendedoras.length) && (
        <div className="card">
          <EmptyState icon="alerta" title={ubicaciones.length === 0 ? 'No hay una bodega o minibodega activa.' : 'No hay vendedoras activas para asignar.'} />
        </div>
      )}

      {!catalogo.isLoading && !catalogo.isError && ubicaciones.length > 0 && catalogo.data?.vendedoras.length > 0 && (
        <form className="card reservas__formulario" onSubmit={crearReserva}>
          <div>
            <h2>Nueva reserva</h2>
            <p>La existencia disponible se comprueba en la base de datos al guardar.</p>
          </div>

          <div className="reservas__campos">
            <label className="field">
              <span className="field__label">Ubicación</span>
              <select className="input" value={ubicacion?.id || ''} onChange={(event) => setUbicacionId(event.target.value)} disabled={crear.isPending}>
                {ubicaciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Producto</span>
              <select className="input" required value={producto?.id || ''} onChange={(event) => { setProductoId(event.target.value); setCajas(''); setPiezas(''); setCantidad(''); }} disabled={crear.isPending}>
                <option value="">Selecciona un producto</option>
                {(catalogo.data?.productos || []).map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Asignar a</span>
              <select className="input" required value={vendedoraId} onChange={(event) => setVendedoraId(event.target.value)} disabled={crear.isPending}>
                <option value="">Selecciona una vendedora</option>
                {catalogo.data?.vendedoras.map((persona) => <option key={persona.id} value={persona.id}>{persona.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Tipo de documento</span>
              <select className="input" value={tipoVenta} onChange={(event) => setTipoVenta(event.target.value)} disabled={crear.isPending}>
                {TIPOS_VENTA.map((item) => <option key={item.id} value={item.id}>{item.texto}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Número de factura, CCF o recibo</span>
              <input className="input" required maxLength="100" value={numeroVenta} onChange={(event) => setNumeroVenta(event.target.value)} disabled={crear.isPending} />
            </label>
          </div>

          {stockQuery.isLoading && <EmptyState loading title="Consultando disponible…" />}
          {stockQuery.isError && (
            <EmptyState icon="alerta" title="No se pudo consultar el saldo de la ubicación.">
              <button className="btn btn--secondary" type="button" onClick={() => stockQuery.refetch()}>Reintentar</button>
            </EmptyState>
          )}

          {producto && !stockQuery.isLoading && !stockQuery.isError && (
            <div className="reservas__cantidad">
              {producto.tipo === 'piso' ? (
                <>
                  <label className="field">
                    <span className="field__label">Cajas</span>
                    <input className="input" type="number" min="0" step="1" inputMode="numeric" value={cajas} onChange={(event) => setCajas(event.target.value)} disabled={crear.isPending} />
                  </label>
                  <label className="field">
                    <span className="field__label">Piezas sueltas</span>
                    <input className="input" type="number" min="0" max={producto.piezas_por_caja - 1} step="1" inputMode="numeric" value={piezas} onChange={(event) => setPiezas(event.target.value)} disabled={crear.isPending} />
                  </label>
                </>
              ) : (
                <label className="field">
                  <span className="field__label">Cantidad ({producto.unidad})</span>
                  <input className="input" type="number" min="1" step="1" inputMode="numeric" value={cantidad} onChange={(event) => setCantidad(event.target.value)} disabled={crear.isPending} />
                </label>
              )}
              <p className={`reservas__saldo${total > disponible ? ' reservas__saldo--error' : ''}`}>
                {total > 0 ? `Reserva: ${formatoStock(total, producto)} · ` : ''}
                Disponible: {formatoStock(disponible, producto)}
              </p>
            </div>
          )}

          <footer className="reservas__acciones">
            <button className="btn btn--primary" type="submit" disabled={!cantidadValida || crear.isPending || stockQuery.isFetching}>
              {crear.isPending ? 'Guardando…' : 'Crear reserva'}
            </button>
          </footer>
        </form>
      )}

      <section className="reservas__historial" aria-labelledby="reservas-historial-titulo">
        <header className="reservas__historial-cabecera">
          <div>
            <h2 id="reservas-historial-titulo">Historial de reservas</h2>
            <p>Consulta las activas, consumidas por despacho y canceladas con su motivo.</p>
          </div>
          <button className="btn btn--secondary" type="button" onClick={() => reservasQuery.refetch()} disabled={reservasQuery.isFetching}>
            {reservasQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </header>
        <div className="reservas__pestanas" role="group" aria-label="Filtrar reservas por estado">
          {[
            ['activa', 'Activas'],
            ['consumida', 'Consumidas'],
            ['cancelada', 'Canceladas'],
          ].map(([estado, texto]) => (
            <button
              key={estado}
              type="button"
              aria-pressed={estadoSeleccionado === estado}
              className={`btn ${estadoSeleccionado === estado ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => setEstadoSeleccionado(estado)}
            >
              {texto} ({conteos[estado] || 0})
            </button>
          ))}
        </div>

        {reservasQuery.isLoading && <EmptyState loading title="Consultando reservas…" />}
        {reservasQuery.isError && (
          <EmptyState icon="alerta" title="No se pudo cargar el historial.">
            <button className="btn btn--secondary" type="button" onClick={() => reservasQuery.refetch()}>Reintentar</button>
          </EmptyState>
        )}
        {!reservasQuery.isLoading && !reservasQuery.isError && visible.length === 0 && (
          <div className="card"><EmptyState title={`No hay reservas ${estadoSeleccionado === 'activa' ? 'activas' : `${estadoSeleccionado}s`}.`} /></div>
        )}
        {!reservasQuery.isLoading && !reservasQuery.isError && visible.length > 0 && (
          <div className="reservas__lista">
            {visible.map((reserva) => (
              <article className="card reservas__tarjeta" key={reserva.id}>
                <header>
                  <div>
                    <h3>{reserva.producto?.nombre || 'Producto no disponible'}</h3>
                    <p>{reserva.producto?.codigo || '—'} · {reserva.ubicacion || 'Ubicación no disponible'}</p>
                  </div>
                  <StatusBadge estado={reserva.estado} />
                </header>
                <dl>
                  <div><dt>Cantidad</dt><dd>{reserva.producto ? formatoStock(reserva.cantidad, reserva.producto) : reserva.cantidad}</dd></div>
                  <div><dt>Vendedora</dt><dd>{reserva.vendedora}</dd></div>
                  <div><dt>Documento de venta</dt><dd>{reserva.doc_venta_tipo?.toUpperCase()} {reserva.doc_venta_numero}</dd></div>
                  <div><dt>Registró</dt><dd>{reserva.creador} · {fechaHora(reserva.creado_en)}</dd></div>
                  {reserva.documento_id && <div><dt>Salida vinculada</dt><dd>Documento {reserva.documento_id}</dd></div>}
                  {reserva.motivo_cancelacion && <div className="reservas__motivo"><dt>Motivo de cancelación</dt><dd>{reserva.motivo_cancelacion}</dd></div>}
                </dl>
                {reserva.estado === 'activa' && (
                  cancelSeleccionada === reserva.id ? (
                    <form className="reservas__cancelar" onSubmit={(event) => cancelarReserva(event, reserva)}>
                      <label className="field">
                        <span className="field__label">Motivo para cancelar</span>
                        <input
                          className="input"
                          required
                          maxLength="500"
                          value={motivos[reserva.id] || ''}
                          onChange={(event) => setMotivos((anteriores) => ({ ...anteriores, [reserva.id]: event.target.value }))}
                          disabled={cancelar.isPending}
                        />
                      </label>
                      <button className="btn btn--primary" type="submit" disabled={cancelar.isPending || !motivos[reserva.id]?.trim()}>
                        {cancelar.isPending ? 'Cancelando…' : 'Confirmar cancelación'}
                      </button>
                      <button className="btn btn--secondary" type="button" onClick={() => setCancelSeleccionada(null)} disabled={cancelar.isPending}>Volver</button>
                    </form>
                  ) : (
                    <footer className="reservas__tarjeta-acciones">
                      <button className="btn btn--secondary" type="button" onClick={() => setCancelSeleccionada(reserva.id)}>Cancelar reserva</button>
                    </footer>
                  )
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
