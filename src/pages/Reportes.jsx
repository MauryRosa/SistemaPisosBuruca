import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useCatalogoReportes, useKardex, useReporteBajoMinimo, useReporteMovimientos } from '../hooks/useReportes.js';
import { valorCSV } from '../lib/csv.js';
import { formatoStock } from '../lib/unidades.js';
import '../css/reportes.css';

const TIPOS = [
  ['salidas', 'Salidas por período'],
  ['kardex', 'Kardex por producto y ubicación'],
  ['movimientos', 'Movimientos por período'],
  ['mermas', 'Mermas'],
  ['bajo-minimo', 'Productos bajo mínimo'],
];
const NOMBRES_TIPO = {
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

function fechaLocal(fecha) {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${año}-${mes}-${dia}`;
}

function descargarCSV(nombre, encabezados, filas) {
  const contenido = [encabezados, ...filas].map((fila) => fila.map(valorCSV).join(';')).join('\r\n');
  const archivo = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function fechaHora(valor) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
}

export default function Reportes() {
  const hoy = fechaLocal(new Date());
  const primerDia = fechaLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [tipo, setTipo] = useState('salidas');
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoy);
  const [productoId, setProductoId] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const catalogo = useCatalogoReportes();
  const movimientos = useReporteMovimientos(tipo, desde, hasta);
  const bajoMinimo = useReporteBajoMinimo(tipo === 'bajo-minimo');
  const kardex = useKardex(productoId, ubicacionId, desde, hasta);
  const filas = movimientos.data || [];
  const productoKardex = kardex.data?.producto;

  const conteoResumen = useMemo(() => {
    if (tipo === 'bajo-minimo') return bajoMinimo.data?.length || 0;
    if (tipo === 'kardex') return kardex.data?.filas.length || 0;
    return filas.length;
  }, [tipo, bajoMinimo.data, kardex.data, filas.length]);

  function exportar() {
    if (tipo === 'bajo-minimo') {
      const data = bajoMinimo.data || [];
      descargarCSV('productos-bajo-minimo.csv',
        ['Código', 'Producto', 'Categoría', 'Físico', 'Reservado', 'Disponible', 'Mínimo'],
        data.map((fila) => [fila.codigo, fila.nombre, fila.categoria, formatoStock(fila.fisico, fila), formatoStock(fila.reservado, fila), formatoStock(fila.disponible, fila), formatoStock(fila.stock_minimo, fila)]));
      return;
    }
    if (tipo === 'kardex') {
      const datos = kardex.data;
      if (!datos) return;
      descargarCSV(`kardex-${datos.producto.codigo}-${desde}-${hasta}.csv`,
        ['Fecha y hora', 'Documento', 'Tipo', 'Entrada', 'Salida', 'Saldo', 'Observación'],
        datos.filas.map((fila) => [fechaHora(fila.fecha), fila.numero, NOMBRES_TIPO[fila.tipo] || fila.tipo, fila.delta > 0 ? formatoStock(fila.delta, datos.producto) : '', fila.delta < 0 ? formatoStock(Math.abs(fila.delta), datos.producto) : '', formatoStock(fila.saldo, datos.producto), fila.observacion]));
      return;
    }
    descargarCSV(`${tipo}-${desde}-${hasta}.csv`,
      ['Fecha', 'Documento', 'Tipo', 'Estado', 'Contingencia en papel', 'Código', 'Producto', 'Cantidad', 'Origen', 'Destino', 'Documento de venta', 'Proveedor', 'Retira', 'Placa', 'Registró', 'Motivo'],
      filas.map((fila) => [
        fechaHora(fila.documento.fecha), fila.numero, NOMBRES_TIPO[fila.documento.tipo] || fila.documento.tipo, fila.documento.estado, fila.documento.es_contingencia ? 'Sí' : 'No',
        fila.producto?.codigo, fila.producto?.nombre, fila.producto ? formatoStock(fila.cantidad, fila.producto) : fila.cantidad,
        fila.origen, fila.destino,
        fila.documento.doc_venta_numero ? `${fila.documento.doc_venta_tipo?.toUpperCase()} ${fila.documento.doc_venta_numero}` : '',
        fila.documento.doc_proveedor_numero, fila.documento.retira_nombre, fila.documento.placa, fila.creador,
        fila.observacion || fila.documento.motivo,
      ]));
  }

  const cargando = tipo === 'kardex'
    ? Boolean(productoId && ubicacionId && kardex.isLoading)
    : tipo === 'bajo-minimo' ? bajoMinimo.isLoading : movimientos.isLoading;
  const error = tipo === 'kardex'
    ? kardex.isError
    : tipo === 'bajo-minimo' ? bajoMinimo.isError : movimientos.isError;
  const hayDatos = conteoResumen > 0;

  return (
    <section className="pagina reportes">
      <header className="pagina__encabezado">
        <div>
          <h1>Reportes</h1>
          <p>Consulta salidas para conciliación, movimientos, mermas, kardex y stock bajo mínimo.</p>
        </div>
        <button className="btn btn--primary" type="button" onClick={exportar} disabled={!hayDatos || cargando || error}>
          Exportar CSV para Excel
        </button>
      </header>

      <div className="card reportes__filtros">
        <label className="field">
          <span className="field__label">Reporte</span>
          <select className="input" value={tipo} onChange={(event) => setTipo(event.target.value)}>
            {TIPOS.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        {tipo !== 'bajo-minimo' && (
          <>
            <label className="field">
              <span className="field__label">Desde</span>
              <input className="input" type="date" value={desde} max={hasta || hoy} onChange={(event) => setDesde(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Hasta</span>
              <input className="input" type="date" value={hasta} min={desde} max={hoy} onChange={(event) => setHasta(event.target.value)} />
            </label>
          </>
        )}
        {tipo === 'kardex' && (
          <>
            <label className="field">
              <span className="field__label">Producto</span>
              <select className="input" value={productoId} onChange={(event) => setProductoId(event.target.value)}>
                <option value="">Selecciona producto</option>
                {catalogo.data?.productos.map((producto) => <option key={producto.id} value={producto.id}>{producto.codigo} · {producto.nombre}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Ubicación</span>
              <select className="input" value={ubicacionId} onChange={(event) => setUbicacionId(event.target.value)}>
                <option value="">Selecciona ubicación</option>
                {catalogo.data?.ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {tipo === 'kardex' && catalogo.isError && <EmptyState icon="alerta" title="No se pudo cargar el catálogo para el kardex." />}
      {tipo === 'kardex' && !productoId && <div className="card"><EmptyState icon="search" title="Selecciona un producto y una ubicación." /></div>}
      {tipo === 'kardex' && productoId && !ubicacionId && <div className="card"><EmptyState icon="ubicacion" title="Selecciona la ubicación para consultar su kardex." /></div>}
      {error && (
        <EmptyState icon="alerta" title="No se pudo generar el reporte.">
          <button className="btn btn--secondary" type="button" onClick={() => {
            if (tipo === 'kardex') kardex.refetch();
            else if (tipo === 'bajo-minimo') bajoMinimo.refetch();
            else movimientos.refetch();
          }}>Reintentar</button>
        </EmptyState>
      )}
      {cargando && <EmptyState loading title="Generando reporte…" />}

      {!cargando && !error && tipo === 'bajo-minimo' && (
        <section className="card reportes__resultado">
          <header><h2>Productos bajo mínimo</h2><span>{conteoResumen} productos</span></header>
          {bajoMinimo.data?.length ? (
            <div className="tabla-scroll">
              <table className="table table--stack">
                <thead><tr><th scope="col">Producto</th><th scope="col">Físico</th><th scope="col">Reservado</th><th scope="col">Disponible</th><th scope="col">Mínimo</th></tr></thead>
                <tbody>{bajoMinimo.data.map((fila) => (
                  <tr key={fila.producto_id}>
                    <td><strong>{fila.nombre}</strong><small className="reportes__meta">{fila.codigo} · {fila.categoria}</small></td>
                    <td data-label="Físico">{formatoStock(fila.fisico, fila)}</td>
                    <td data-label="Reservado">{formatoStock(fila.reservado, fila)}</td>
                    <td data-label="Disponible"><StatusBadge estado="bajo-minimo" texto={formatoStock(fila.disponible, fila)} /></td>
                    <td data-label="Mínimo">{formatoStock(fila.stock_minimo, fila)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon="check" title="Todos los productos están sobre su mínimo." />}
        </section>
      )}

      {!cargando && !error && tipo === 'kardex' && productoId && ubicacionId && kardex.data && (
        <section className="card reportes__resultado">
          <header>
            <div><h2>Kardex · {productoKardex.nombre}</h2><p>{productoKardex.codigo} · {kardex.data.ubicacion.nombre}</p></div>
            <span>{kardex.data.filas.length} movimientos · saldo inicial {formatoStock(kardex.data.saldoInicial, productoKardex)}</span>
          </header>
          {kardex.data.filas.length ? (
            <div className="tabla-scroll">
              <table className="table table--stack">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Documento</th><th scope="col">Tipo</th><th scope="col">Entrada</th><th scope="col">Salida</th><th scope="col">Saldo</th></tr></thead>
                <tbody>{kardex.data.filas.map((fila, indice) => (
                  <tr key={`${fila.numero}-${fila.fecha}-${indice}`}>
                    <td data-label="Fecha">{fechaHora(fila.fecha)}</td>
                    <td data-label="Documento">{fila.numero}</td>
                    <td data-label="Tipo">{NOMBRES_TIPO[fila.tipo] || fila.tipo}</td>
                    <td data-label="Entrada">{fila.delta > 0 ? formatoStock(fila.delta, productoKardex) : '—'}</td>
                    <td data-label="Salida">{fila.delta < 0 ? formatoStock(Math.abs(fila.delta), productoKardex) : '—'}</td>
                    <td data-label="Saldo"><strong>{formatoStock(fila.saldo, productoKardex)}</strong></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState title="No hay movimientos en este período." />}
          <p className="reportes__saldo-final">Saldo al cierre: <strong>{formatoStock(kardex.data.saldoFinal, productoKardex)}</strong></p>
        </section>
      )}

      {!cargando && !error && ['salidas', 'movimientos', 'mermas'].includes(tipo) && (
        <section className="card reportes__resultado">
          <header><h2>{TIPOS.find(([id]) => id === tipo)?.[1]}</h2><span>{filas.length} líneas · {desde} a {hasta}</span></header>
          {filas.length ? (
            <div className="tabla-scroll">
              <table className="table table--stack">
                <thead><tr><th scope="col">Documento</th><th scope="col">Fecha</th><th scope="col">Tipo y estado</th><th scope="col">Contingencia en papel</th><th scope="col">Producto</th><th scope="col">Cantidad</th><th scope="col">Ubicaciones</th><th scope="col">Registró</th></tr></thead>
                <tbody>{filas.map((fila) => (
                  <tr key={fila.id}>
                    <td data-label="Documento">{fila.numero}<small className="reportes__meta">{fila.documento.doc_venta_numero ? `${fila.documento.doc_venta_tipo} ${fila.documento.doc_venta_numero}` : fila.documento.doc_proveedor_numero || ''}</small></td>
                    <td data-label="Fecha">{fechaHora(fila.documento.fecha)}</td>
                    <td data-label="Tipo y estado">{NOMBRES_TIPO[fila.documento.tipo] || fila.documento.tipo}<br /><StatusBadge estado={fila.documento.estado} /></td>
                    <td data-label="Contingencia en papel">{fila.documento.es_contingencia ? 'Sí' : 'No'}</td>
                    <td data-label="Producto"><strong>{fila.producto?.nombre || 'Producto no disponible'}</strong><small className="reportes__meta">{fila.producto?.codigo || '—'}</small></td>
                    <td data-label="Cantidad">{fila.producto ? formatoStock(fila.cantidad, fila.producto) : fila.cantidad}{fila.cantidad_cajas_abiertas > 0 ? ` · ${fila.cantidad_cajas_abiertas} cajas abiertas` : ''}</td>
                    <td data-label="Ubicaciones">{fila.origen && fila.destino ? `${fila.origen} → ${fila.destino}` : fila.origen || fila.destino || '—'}</td>
                    <td data-label="Registró">{fila.creador}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState icon="search" title="No hay movimientos para los filtros seleccionados." />}
        </section>
      )}
    </section>
  );
}
