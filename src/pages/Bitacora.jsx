import { useMemo, useState } from 'react';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { useAnularMovimiento, useBitacora, useDocumentosAnulables, useUsuariosBitacora } from '../hooks/useBitacora.js';
import { valorCSV } from '../lib/csv.js';
import '../css/bitacora.css';

const TABLAS = [
  ['documentos', 'Documentos'],
  ['detalle_documento', 'Líneas de movimientos'],
  ['existencias', 'Existencias'],
  ['reservas', 'Reservas'],
  ['conteos', 'Conteos'],
  ['detalle_conteo', 'Líneas de conteo'],
  ['ordenes_pedido', 'Órdenes de pedido'],
  ['detalle_orden_pedido', 'Líneas de pedido'],
  ['productos', 'Productos'],
  ['proveedores', 'Proveedores'],
  ['ubicaciones', 'Ubicaciones'],
  ['usuarios', 'Usuarios'],
];
const ACCIONES = [['insert', 'Creación'], ['update', 'Actualización'], ['delete', 'Eliminación']];
const SIN_FILAS = [];
const TAMANO_PAGINA_ANULACIONES = 25;
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
};

function serializar(valor) {
  return valor ? JSON.stringify(valor, null, 2) : 'Sin valor';
}

function exportarBitacora(filas) {
  const encabezados = ['Fecha y hora', 'Usuario', 'Acción', 'Tabla', 'Registro', 'Valor anterior', 'Valor nuevo'];
  const lineas = filas.map((fila) => [
    new Date(fila.fecha_hora).toLocaleString('es-SV'),
    fila.usuario,
    fila.accion,
    fila.tabla,
    fila.registro_id,
    serializar(fila.valor_anterior),
    serializar(fila.valor_nuevo),
  ]);
  const contenido = [encabezados, ...lineas].map((linea) => linea.map(valorCSV).join(';')).join('\r\n');
  const archivo = new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'bitacora-auditoria.csv';
  enlace.click();
  URL.revokeObjectURL(url);
}

function fechaLocal(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function fechaHora(valor) {
  return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

function explicarError(error) {
  if (error?.code === 'P0001') return error.message;
  return 'No se pudo anular el documento. Actualiza los saldos e inténtalo de nuevo.';
}

export default function Bitacora() {
  const hoy = fechaLocal(new Date());
  const mes = fechaLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [desde, setDesde] = useState(mes);
  const [hasta, setHasta] = useState(hoy);
  const [tabla, setTabla] = useState('');
  const [accion, setAccion] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAnulable, setBusquedaAnulable] = useState('');
  const [paginaAnulables, setPaginaAnulables] = useState(0);
  const [limite, setLimite] = useState(200);
  const [documentoAnular, setDocumentoAnular] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const bitacora = useBitacora({ desde, hasta, tabla, accion, usuarioId, limite });
  const usuarios = useUsuariosBitacora();
  const anulables = useDocumentosAnulables();
  const anular = useAnularMovimiento();
  const filas = bitacora.data?.filas || SIN_FILAS;
  const filasVisibles = useMemo(() => filas.filter((fila) => (
    !busqueda.trim() || `${fila.registro_id || ''} ${fila.tabla}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  )), [filas, busqueda]);
  const documentosAnulables = anulables.data || SIN_FILAS;
  const documentosAnulablesFiltrados = useMemo(() => {
    const texto = busquedaAnulable.trim().toLocaleLowerCase('es-SV');
    if (!texto) return documentosAnulables;
    return documentosAnulables.filter((documento) => (
      `${documento.numero} ${NOMBRES_TIPO[documento.tipo] || documento.tipo} ${documento.doc_venta_numero || ''} ${documento.motivo || ''}`
        .toLocaleLowerCase('es-SV')
        .includes(texto)
    ));
  }, [documentosAnulables, busquedaAnulable]);
  const paginasAnulables = Math.ceil(documentosAnulablesFiltrados.length / TAMANO_PAGINA_ANULACIONES);
  const paginaAnulablesActual = Math.min(paginaAnulables, Math.max(0, paginasAnulables - 1));
  const documentosAnulablesVisibles = documentosAnulablesFiltrados.slice(
    paginaAnulablesActual * TAMANO_PAGINA_ANULACIONES,
    (paginaAnulablesActual + 1) * TAMANO_PAGINA_ANULACIONES,
  );

  function cambiarFiltro(setter, valor) {
    setter(valor);
    setLimite(200);
  }

  async function confirmarAnulacion(event) {
    event.preventDefault();
    if (!documentoAnular || !motivo.trim()) return;
    setMensaje(null);
    try {
      const id = await anular.mutateAsync({ id: documentoAnular.id, motivo: motivo.trim() });
      setMensaje({ tipo: 'exito', texto: `Documento ${documentoAnular.numero} anulado. Se creó el movimiento inverso ${id}.` });
      setDocumentoAnular(null);
      setMotivo('');
    } catch (error) {
      setMensaje({ tipo: 'error', texto: explicarError(error) });
    }
  }

  return (
    <section className="pagina bitacora">
      <header className="pagina__encabezado">
        <div>
          <h1>Bitácora de auditoría</h1>
          <p>Registro de quién cambió cada dato, cuándo lo hizo y sus valores anteriores y nuevos.</p>
        </div>
        <button className="btn btn--secondary" type="button" onClick={() => exportarBitacora(filasVisibles)} disabled={!filasVisibles.length}>
          Exportar CSV
        </button>
      </header>

      {mensaje && (
        <p className={`bitacora__mensaje bitacora__mensaje--${mensaje.tipo}`} role={mensaje.tipo === 'error' ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      <div className="card bitacora__filtros">
        <label className="field">
          <span className="field__label">Desde</span>
          <input className="input" type="date" value={desde} max={hasta} onChange={(event) => cambiarFiltro(setDesde, event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Hasta</span>
          <input className="input" type="date" value={hasta} min={desde} max={hoy} onChange={(event) => cambiarFiltro(setHasta, event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Tabla</span>
          <select className="input" value={tabla} onChange={(event) => cambiarFiltro(setTabla, event.target.value)}>
            <option value="">Todas</option>
            {TABLAS.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Acción</span>
          <select className="input" value={accion} onChange={(event) => cambiarFiltro(setAccion, event.target.value)}>
            <option value="">Todas</option>
            {ACCIONES.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Usuario</span>
          <select className="input" value={usuarioId} onChange={(event) => cambiarFiltro(setUsuarioId, event.target.value)}>
            <option value="">Todos</option>
            {usuarios.data?.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Buscar por registro o tabla</span>
          <input className="input" type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Número o nombre de tabla" />
        </label>
      </div>

      {bitacora.isLoading && <EmptyState loading title="Consultando auditoría…" />}
      {bitacora.isError && (
        <EmptyState icon="alerta" title="No se pudo consultar la bitácora.">
          <button className="btn btn--secondary" type="button" onClick={() => bitacora.refetch()}>Reintentar</button>
        </EmptyState>
      )}
      {!bitacora.isLoading && !bitacora.isError && filasVisibles.length === 0 && (
        <div className="card"><EmptyState icon="search" title="No hay registros con estos filtros." /></div>
      )}
      {!bitacora.isLoading && !bitacora.isError && filasVisibles.length > 0 && (
        <section className="card bitacora__tabla">
          <header><h2>Eventos</h2><span>{filasVisibles.length} visibles · {bitacora.data.total} en el período</span></header>
          <div className="tabla-scroll">
            <table className="table table--stack">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">Tabla</th><th scope="col">Registro</th><th scope="col">Cambios</th></tr></thead>
              <tbody>{filasVisibles.map((fila) => (
                <tr key={fila.id}>
                  <td data-label="Fecha">{fechaHora(fila.fecha_hora)}</td>
                  <td data-label="Usuario">{fila.usuario}</td>
                  <td data-label="Acción"><StatusBadge estado={fila.accion === 'insert' ? 'aprobado' : fila.accion === 'delete' ? 'anulado' : 'pendiente'} texto={fila.accion === 'insert' ? 'Creación' : fila.accion === 'delete' ? 'Eliminación' : 'Actualización'} /></td>
                  <td data-label="Tabla">{fila.tabla}</td>
                  <td data-label="Registro">{fila.registro_id || '—'}</td>
                  <td data-label="Cambios">
                    <details className="bitacora__detalle">
                      <summary>Ver valores</summary>
                      <div>
                        <section><h3>Antes</h3><pre>{serializar(fila.valor_anterior)}</pre></section>
                        <section><h3>Después</h3><pre>{serializar(fila.valor_nuevo)}</pre></section>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {bitacora.data.filas.length < bitacora.data.total && (
            <button className="btn btn--secondary" type="button" onClick={() => setLimite((anterior) => anterior + 200)} disabled={bitacora.isFetching}>
              {bitacora.isFetching ? 'Cargando…' : 'Cargar más eventos'}
            </button>
          )}
        </section>
      )}

      <section className="bitacora__anulaciones" aria-labelledby="bitacora-anulaciones-titulo">
        <header>
          <div>
            <h2 id="bitacora-anulaciones-titulo">Anular un movimiento aprobado</h2>
            <p>La anulación registra un documento inverso y conserva el original con su motivo.</p>
          </div>
          <button className="btn btn--secondary" type="button" onClick={() => anulables.refetch()} disabled={anulables.isFetching}>Actualizar</button>
        </header>
        {anulables.isLoading && <EmptyState loading title="Consultando documentos aprobados…" />}
        {anulables.isError && <EmptyState icon="alerta" title="No se pudieron cargar los documentos para anular." />}
        {!anulables.isLoading && !anulables.isError && documentosAnulables.length === 0 && (
          <div className="card"><EmptyState title="No hay movimientos aprobados que puedan anularse." /></div>
        )}
        {!anulables.isLoading && !anulables.isError && documentosAnulables.length > 0 && (
          <>
            <label className="field bitacora__busqueda-anulables">
              <span className="field__label">Buscar documento para anular</span>
              <input
                className="input"
                type="search"
                value={busquedaAnulable}
                onChange={(event) => {
                  setBusquedaAnulable(event.target.value);
                  setPaginaAnulables(0);
                }}
                placeholder="Número, tipo, referencia o motivo"
              />
            </label>
            {documentosAnulablesFiltrados.length === 0 ? (
              <div className="card"><EmptyState icon="search" title="No hay documentos que coincidan con la búsqueda." /></div>
            ) : (
              <>
                <p className="bitacora__anulables-resumen" aria-live="polite">
                  Mostrando {paginaAnulablesActual * TAMANO_PAGINA_ANULACIONES + 1}–{Math.min((paginaAnulablesActual + 1) * TAMANO_PAGINA_ANULACIONES, documentosAnulablesFiltrados.length)} de {documentosAnulablesFiltrados.length} documentos anulables
                </p>
                <div className="bitacora__anulables">
            {documentosAnulablesVisibles.map((documento) => {
              const trasladoPendiente = documento.tipo === 'traslado' && !documento.traslado_confirmado_en;
              return (
                <article className="card bitacora__anulable" key={documento.id}>
                  <div>
                    <strong>{documento.numero} · {NOMBRES_TIPO[documento.tipo] || documento.tipo}</strong>
                    <p>{fechaHora(documento.fecha)}{documento.doc_venta_numero ? ` · ${documento.doc_venta_tipo} ${documento.doc_venta_numero}` : ''}</p>
                    {documento.motivo && <small>{documento.motivo}</small>}
                    {trasladoPendiente && <small className="bitacora__bloqueo">Primero confirma la recepción del traslado.</small>}
                  </div>
                  {documentoAnular?.id === documento.id ? (
                    <form onSubmit={confirmarAnulacion}>
                      <label className="field">
                        <span className="field__label">Motivo de anulación</span>
                        <input className="input" required maxLength="500" value={motivo} onChange={(event) => setMotivo(event.target.value)} disabled={anular.isPending} />
                      </label>
                      <button className="btn btn--primary" type="submit" disabled={anular.isPending || !motivo.trim()}>{anular.isPending ? 'Anulando…' : 'Confirmar anulación'}</button>
                      <button className="btn btn--secondary" type="button" onClick={() => { setDocumentoAnular(null); setMotivo(''); }} disabled={anular.isPending}>Volver</button>
                    </form>
                  ) : (
                    <button className="btn btn--secondary" type="button" onClick={() => setDocumentoAnular(documento)} disabled={trasladoPendiente}>Anular</button>
                  )}
                </article>
              );
            })}
                </div>
                {paginasAnulables > 1 && (
                  <nav className="bitacora__anulables-paginacion" aria-label="Paginación de documentos anulables">
                    <button className="btn btn--secondary" type="button" onClick={() => setPaginaAnulables(paginaAnulablesActual - 1)} disabled={paginaAnulablesActual === 0}>
                      Anterior
                    </button>
                    <span>Página {paginaAnulablesActual + 1} de {paginasAnulables}</span>
                    <button className="btn btn--secondary" type="button" onClick={() => setPaginaAnulables(paginaAnulablesActual + 1)} disabled={paginaAnulablesActual + 1 >= paginasAnulables}>
                      Siguiente
                    </button>
                  </nav>
                )}
              </>
            )}
          </>
        )}
      </section>
    </section>
  );
}
