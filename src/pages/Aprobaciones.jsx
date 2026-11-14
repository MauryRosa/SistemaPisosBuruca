import { useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAprobaciones, useAprobarMovimiento, useRechazarMovimiento } from '../hooks/useAprobaciones.js';
import { useAprobarConteo, useConteos } from '../hooks/useConteos.js';
import { formatoStock } from '../lib/unidades.js';
import '../css/aprobaciones.css';

const TIPOS = {
  entrada_compra: 'Recepción de compra',
  entrada_devolucion_cliente: 'Devolución de cliente',
  entrada_cambio: 'Cambio o garantía',
  inventario_inicial: 'Inventario inicial',
  salida_venta: 'Salida por venta',
  despacho_minibodega: 'Despacho desde minibodega',
  traslado: 'Traslado',
  merma: 'Merma o daño',
  consumo_interno: 'Consumo interno',
  devolucion_proveedor: 'Devolución a proveedor',
  salida_cambio: 'Salida por cambio',
  ajuste_positivo: 'Ajuste positivo',
  ajuste_negativo: 'Ajuste negativo',
};

function fechaHora(valor) {
  return new Date(valor).toLocaleString('es-SV', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function urlSegura(valor) {
  if (!valor) return null;
  try {
    const url = new URL(valor, window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function mensajeError(error) {
  if (error?.code === 'P0001') return error.message;
  return 'No se pudo procesar el movimiento. Actualiza la lista e inténtalo de nuevo.';
}

function cantidadLinea(linea) {
  if (!linea.producto) return `${linea.cantidad} unidades`;
  return formatoStock(linea.cantidad, linea.producto);
}

function diferenciaConteo(detalle) {
  if (!detalle.producto) return String(detalle.diferencia);
  if (detalle.diferencia === 0) return 'Sin diferencia';
  const signo = detalle.diferencia > 0 ? '+' : '−';
  return `${signo}${formatoStock(Math.abs(detalle.diferencia), detalle.producto)}`;
}

export default function Aprobaciones() {
  const { data: documentos = [], isLoading, isError, refetch } = useAprobaciones();
  const aprobar = useAprobarMovimiento();
  const rechazar = useRechazarMovimiento();
  const conteosQuery = useConteos();
  const aprobarConteo = useAprobarConteo();
  const conteosPendientes = (conteosQuery.data || []).filter((conteo) => conteo.estado === 'pendiente');
  const [motivos, setMotivos] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const procesando = aprobar.isPending || rechazar.isPending;

  async function aprobarDocumento(documento) {
    setMensaje(null);
    try {
      await aprobar.mutateAsync({ p_documento_id: documento.id });
      setMensaje({ tipo: 'exito', texto: `Se aprobó el movimiento ${documento.numero}.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  async function rechazarDocumento(event, documento) {
    event.preventDefault();
    const motivo = motivos[documento.id]?.trim();
    if (!motivo) return;
    setMensaje(null);
    try {
      await rechazar.mutateAsync({ p_documento_id: documento.id, p_motivo: motivo });
      setMotivos((anteriores) => ({ ...anteriores, [documento.id]: '' }));
      setMensaje({ tipo: 'exito', texto: `Se rechazó el movimiento ${documento.numero}.` });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeError(error) });
    }
  }

  return (
    <section className="pagina">
      <header className="pagina__encabezado">
        <div>
          <h1>Aprobaciones</h1>
          <p>Las mermas y los ajustes pendientes no cambian las existencias hasta resolverse.</p>
        </div>
        <div className="aprobaciones__contadores">
          <StatusBadge estado="pendiente" texto={`${documentos.length} movimiento${documentos.length === 1 ? '' : 's'}`} />
          <StatusBadge estado="pendiente" texto={`${conteosPendientes.length} conteo${conteosPendientes.length === 1 ? '' : 's'}`} />
        </div>
      </header>

      {mensaje && (
        <p className={`aprobaciones__mensaje aprobaciones__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {isLoading && <EmptyState loading title="Consultando movimientos pendientes…" />}
      {isError && (
        <EmptyState icon="alerta" title="No se pudieron cargar las aprobaciones.">
          <button type="button" className="btn btn--secondary" onClick={() => refetch()}>
            Reintentar
          </button>
        </EmptyState>
      )}
      {!isLoading && !isError && documentos.length === 0 && (
        <div className="card">
          <EmptyState icon="aprobar" title="No hay movimientos por revisar." />
        </div>
      )}

      {!isLoading && !isError && documentos.length > 0 && (
        <div className="aprobaciones__lista">
          {documentos.map((documento) => {
            const enlace = urlSegura(documento.evidencia_enlace);
            return (
              <article className="card aprobaciones__tarjeta" key={documento.id}>
                <header className="aprobaciones__cabecera">
                  <div>
                    <p className="aprobaciones__tipo">{TIPOS[documento.tipo] || documento.tipo}</p>
                    <h2>{documento.numero}</h2>
                    <p className="aprobaciones__meta">
                      Registró {documento.creador} · {fechaHora(documento.fecha)}
                    </p>
                  </div>
                  <StatusBadge estado="pendiente" />
                </header>

                {(documento.doc_venta_numero || documento.doc_proveedor_numero) && (
                  <p className="aprobaciones__referencia">
                    Documento relacionado:{' '}
                    <strong>{documento.doc_venta_numero || documento.doc_proveedor_numero}</strong>
                    {documento.doc_venta_tipo ? ` · ${documento.doc_venta_tipo}` : ''}
                  </p>
                )}

                {documento.es_contingencia && (
                  <p className="aprobaciones__contingencia">Digitalización de un registro de contingencia en papel</p>
                )}

                {documento.motivo && (
                  <div className="aprobaciones__motivo">
                    <span className="field__label">Motivo</span>
                    <p>{documento.motivo}</p>
                  </div>
                )}

                {enlace && (
                  <p>
                    <a href={enlace} target="_blank" rel="noreferrer" className="aprobaciones__evidencia">
                      Abrir evidencia adjunta
                    </a>
                  </p>
                )}

                <div className="aprobaciones__lineas">
                  <h3>Productos ({documento.lineas.length})</h3>
                  {documento.lineas.length === 0 ? (
                    <p>Este movimiento no contiene líneas de producto.</p>
                  ) : (
                    <ul>
                      {documento.lineas.map((linea) => (
                        <li key={linea.id}>
                          <div>
                            <strong>{linea.producto?.nombre || 'Producto no disponible'}</strong>
                            {linea.producto?.codigo && <span>{linea.producto.codigo}</span>}
                            {linea.observacion && <small>{linea.observacion}</small>}
                          </div>
                          <strong className="aprobaciones__cantidad">{cantidadLinea(linea)}</strong>
                          <span className="aprobaciones__ubicacion">
                            {linea.origen && linea.destino
                              ? `${linea.origen} → ${linea.destino}`
                              : linea.origen || linea.destino || 'Ubicación no disponible'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <footer className="aprobaciones__acciones">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={procesando}
                    onClick={() => aprobarDocumento(documento)}
                  >
                    {aprobar.isPending && aprobar.variables?.p_documento_id === documento.id
                      ? 'Aprobando…'
                      : 'Aprobar y aplicar'}
                  </button>
                  <form onSubmit={(event) => rechazarDocumento(event, documento)}>
                    <label className="sr-only" htmlFor={`rechazo-${documento.id}`}>
                      Motivo para rechazar {documento.numero}
                    </label>
                    <input
                      id={`rechazo-${documento.id}`}
                      className="input"
                      required
                      maxLength={500}
                      value={motivos[documento.id] || ''}
                      onChange={(event) => setMotivos((anteriores) => ({
                        ...anteriores,
                        [documento.id]: event.target.value,
                      }))}
                      placeholder="Motivo del rechazo"
                    />
                    <button className="btn btn--secondary" type="submit" disabled={procesando || !motivos[documento.id]?.trim()}>
                      {rechazar.isPending && rechazar.variables?.p_documento_id === documento.id
                        ? 'Rechazando…'
                        : 'Rechazar'}
                    </button>
                  </form>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      <section className="aprobaciones__conteos" aria-labelledby="aprobaciones-conteos-titulo">
        <header>
          <div>
            <h2 id="aprobaciones-conteos-titulo">Conteos físicos</h2>
            <p>Las diferencias se aplican mediante documentos de ajuste auditados.</p>
          </div>
          <StatusBadge estado="pendiente" texto={`${conteosPendientes.length} pendiente${conteosPendientes.length === 1 ? '' : 's'}`} />
        </header>
        {conteosQuery.isLoading && <EmptyState loading title="Consultando conteos pendientes…" />}
        {conteosQuery.isError && (
          <EmptyState icon="alerta" title="No se pudieron cargar los conteos.">
            <button type="button" className="btn btn--secondary" onClick={() => conteosQuery.refetch()}>Reintentar</button>
          </EmptyState>
        )}
        {!conteosQuery.isLoading && !conteosQuery.isError && conteosPendientes.length === 0 && (
          <div className="card"><EmptyState title="No hay conteos físicos por aprobar." /></div>
        )}
        {!conteosQuery.isLoading && !conteosQuery.isError && conteosPendientes.length > 0 && (
          <div className="aprobaciones__lista">
            {conteosPendientes.map((conteo) => {
              const diferencias = conteo.detalles.filter((detalle) => detalle.diferencia !== 0);
              return (
                <article className="card aprobaciones__tarjeta" key={conteo.id}>
                  <header className="aprobaciones__cabecera">
                    <div>
                      <p className="aprobaciones__tipo">Conteo {conteo.alcance === 'total' ? 'total' : `por categoría ${conteo.categoria}`}</p>
                      <h2>{conteo.ubicacion}</h2>
                      <p className="aprobaciones__meta">Registró {conteo.creador} · {conteo.fecha}</p>
                    </div>
                    <StatusBadge estado="pendiente" />
                  </header>
                  <p className="aprobaciones__referencia">
                    {conteo.detalles.length} productos · {diferencias.length} diferencias
                  </p>
                  <div className="aprobaciones__lineas">
                    <h3>Diferencias del conteo</h3>
                    {diferencias.length === 0 ? <p>El conteo coincide con el sistema; aprobarlo no cambiará existencias.</p> : (
                      <ul>
                        {diferencias.map((detalle) => (
                          <li key={detalle.id}>
                            <div>
                              <strong>{detalle.producto?.nombre || 'Producto no disponible'}</strong>
                              {detalle.producto?.codigo && <span>{detalle.producto.codigo}</span>}
                              <small>Sistema {detalle.producto ? formatoStock(detalle.cantidad_sistema, detalle.producto) : detalle.cantidad_sistema} · Contado {detalle.producto ? formatoStock(detalle.cantidad_contada, detalle.producto) : detalle.cantidad_contada}</small>
                            </div>
                            <strong className="aprobaciones__cantidad">{diferenciaConteo(detalle)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <footer className="aprobaciones__acciones">
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={aprobarConteo.isPending || procesando}
                      onClick={async () => {
                        setMensaje(null);
                        try {
                          await aprobarConteo.mutateAsync({ p_conteo_id: conteo.id });
                          setMensaje({ tipo: 'exito', texto: `Conteo ${conteo.id} aprobado y ajustes aplicados.` });
                        } catch (error) {
                          setMensaje({ tipo: 'error', texto: mensajeError(error) });
                        }
                      }}
                    >
                      {aprobarConteo.isPending && aprobarConteo.variables?.p_conteo_id === conteo.id ? 'Aplicando…' : 'Aprobar y aplicar ajustes'}
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
