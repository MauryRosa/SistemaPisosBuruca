import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAuth } from '../context/useAuth.js';
import { useDetalleProducto } from '../hooks/useDetalleProducto.js';
import { formatoStock } from '../lib/unidades.js';
import '../css/detalle-producto.css';

const TIPOS = {
  entrada_compra: 'Entrada de compra',
  entrada_devolucion_cliente: 'Devolución de cliente',
  entrada_cambio: 'Cambio o garantía',
  inventario_inicial: 'Inventario inicial',
  salida_venta: 'Salida por venta',
  despacho_minibodega: 'Despacho de minibodega',
  traslado: 'Traslado',
  merma: 'Merma',
  consumo_interno: 'Consumo interno',
  devolucion_proveedor: 'Devolución a proveedor',
  salida_cambio: 'Salida por cambio',
  ajuste_positivo: 'Ajuste positivo',
  ajuste_negativo: 'Ajuste negativo',
  apertura_caja: 'Apertura de caja',
  anulacion: 'Anulación',
};

function fechaHora(valor) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

export default function DetalleProducto() {
  const { productoId } = useParams();
  const id = Number(productoId);
  const { perfil } = useAuth();
  const mostrarMovimientos = ['administrador', 'jefe_bodega'].includes(perfil?.rol);
  const consulta = useDetalleProducto(id, mostrarMovimientos);
  const producto = consulta.data?.producto;

  return (
    <section className="pagina detalle-producto">
      <header className="pagina__encabezado">
        <div>
          <Link className="detalle-producto__volver" to="/stock">← Volver a consulta de stock</Link>
          <h1>{producto?.nombre || 'Detalle de producto'}</h1>
          {producto && <p>{producto.codigo} · {producto.categoria}{producto.medida ? ` · ${producto.medida}` : ''}</p>}
        </div>
        {producto && <StatusBadge estado={producto.activo ? 'activo' : 'inactivo'} />}
      </header>

      {consulta.isLoading && <EmptyState loading title="Consultando producto, existencias y movimientos…" />}
      {consulta.isError && (
        <EmptyState icon="alerta" title="No se pudo cargar el detalle del producto.">
          <button className="btn btn--secondary" type="button" onClick={() => consulta.refetch()}>Reintentar</button>
        </EmptyState>
      )}

      {!consulta.isLoading && !consulta.isError && producto && (
        <>
          <section className="card detalle-producto__ficha">
            <h2>Ficha del producto</h2>
            <dl>
              <div><dt>Tipo</dt><dd>{producto.tipo === 'piso' ? 'Piso o revestimiento' : 'Accesorio o material'}</dd></div>
              <div><dt>Unidad base</dt><dd>{producto.tipo === 'piso' ? `Pieza · ${producto.piezas_por_caja} piezas por caja` : producto.unidad}</dd></div>
              <div><dt>Despacho</dt><dd>{producto.tipo === 'piso' ? producto.despacho_por : 'Unidad simple'}</dd></div>
              <div><dt>Stock mínimo</dt><dd>{formatoStock(producto.stock_minimo, producto)}</dd></div>
            </dl>
          </section>

          <section className="card detalle-producto__stock">
            <header><h2>Existencias por ubicación</h2><Link to="/stock" className="card__link">Ver todo el stock</Link></header>
            {consulta.data.existencias.length === 0 ? <EmptyState title="No tiene saldo en ubicaciones activas." /> : (
              <div className="tabla-scroll">
                <table className="table table--stack">
                  <thead><tr><th scope="col">Ubicación</th><th scope="col">Físico</th><th scope="col">Reservado</th><th scope="col">Disponible</th></tr></thead>
                  <tbody>{consulta.data.existencias.map((fila) => (
                    <tr key={fila.ubicacion_id}>
                      <td data-label="Ubicación">{fila.ubicacion}{!fila.vendible ? ' · no vendible' : ''}</td>
                      <td data-label="Físico">{formatoStock(fila.fisico, producto)}</td>
                      <td data-label="Reservado">{formatoStock(fila.reservado, producto)}</td>
                      <td data-label="Disponible">{formatoStock(fila.disponible, producto)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>

          {mostrarMovimientos ? (
            <section className="card detalle-producto__movimientos">
              <header><h2>Movimientos recientes</h2><Link to="/bitacora" className="card__link">Abrir bitácora</Link></header>
              {consulta.data.movimientos.length === 0 ? <EmptyState title="Todavía no hay movimientos para este producto." /> : (
                <div className="tabla-scroll">
                  <table className="table table--stack">
                    <thead><tr><th scope="col">Fecha</th><th scope="col">Documento</th><th scope="col">Tipo y estado</th><th scope="col">Cantidad</th><th scope="col">Ubicación</th></tr></thead>
                    <tbody>{consulta.data.movimientos.map((movimiento) => (
                      <tr key={movimiento.id}>
                        <td data-label="Fecha">{fechaHora(movimiento.documento.fecha)}</td>
                        <td data-label="Documento">{movimiento.numero}</td>
                        <td data-label="Tipo y estado">{TIPOS[movimiento.documento.tipo] || movimiento.documento.tipo}<br /><StatusBadge estado={movimiento.documento.estado} /></td>
                        <td data-label="Cantidad">{formatoStock(movimiento.cantidad, producto)}</td>
                        <td data-label="Ubicación">{movimiento.origen && movimiento.destino ? `${movimiento.origen} → ${movimiento.destino}` : movimiento.origen || movimiento.destino || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <div className="card"><EmptyState icon="check" title="El historial de movimientos está disponible para bodega y administración." /></div>
          )}
        </>
      )}
    </section>
  );
}
