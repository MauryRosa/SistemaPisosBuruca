import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { useResumen } from '../hooks/useResumen.js';
import { useBajoMinimo, usePendientes, useUltimosMovimientos } from '../hooks/useDashboard.js';
import { DOC_VENTA, fechaCorta, nombreTipo } from '../lib/documentos.js';
import { formatoStock } from '../lib/unidades.js';
import Icon from '../components/ui/Icon.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import '../css/dashboard.css';

function Panel({ titulo, enlace, children, ancho = false }) { return <section className={`card${ancho ? ' panel--ancho' : ''}`}><header className="card__header"><h2>{titulo}</h2>{enlace}</header>{children}</section>; }
function Estado({ consulta, vacio, children }) { if (consulta.isLoading) return <EmptyState loading title="Cargando…" />; if (consulta.isError) return <EmptyState icon="alerta" title="No se pudo cargar la información." />; if (!consulta.data?.length) return <EmptyState icon="check" title={vacio} />; return children; }

export default function Dashboard() {
  const { perfil } = useAuth(); const esAdmin = perfil.rol === 'administrador'; const resumen = useResumen(); const pendientes = usePendientes(); const bajoMinimo = useBajoMinimo(); const movimientos = useUltimosMovimientos(); const r = resumen.data || {};
  const hoy = new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' });
  return <section className="pagina">
    <header className="pagina__encabezado"><div><h1>Inicio</h1><p>Hola, {perfil.nombre} · <span className="capitalizar">{hoy}</span></p></div>{esAdmin && <Link to="/pedidos" className="btn btn--primary">+ Nueva orden de pedido</Link>}</header>
    {!esAdmin && <nav className="accesos" aria-label="Accesos rápidos"><Link to="/salidas" className="acceso acceso--principal"><Icon name="salida" size={24} /> Nueva salida</Link><Link to="/entradas" className="acceso"><Icon name="entrada" size={24} /> Nueva entrada</Link><Link to="/traslados" className="acceso"><Icon name="traslado" size={24} /> Traslado a minibodega</Link></nav>}
    <div className="resumen"><StatCard icon="aprobar" value={r.aprobaciones_pendientes} label={esAdmin ? 'Aprobaciones pendientes' : 'Pendientes de aprobación'} alert={r.aprobaciones_pendientes > 0} loading={resumen.isLoading} /><StatCard icon="alerta" value={r.productos_bajo_minimo} label="Productos bajo mínimo" alert={r.productos_bajo_minimo > 0} loading={resumen.isLoading} /><StatCard icon="reserva" value={r.reservas_activas} label="Reservas activas" loading={resumen.isLoading} /><StatCard icon="reloj" value={r.movimientos_hoy} label="Movimientos de hoy" loading={resumen.isLoading} /></div>
    <div className="paneles">
      <Panel titulo="Pendientes de aprobación" enlace={esAdmin && <Link to="/aprobaciones" className="card__link">Ver todas</Link>}><Estado consulta={pendientes} vacio="No hay aprobaciones pendientes."><ul className="lista">{pendientes.data?.map((d) => <li key={d.id} className="lista__item"><div className="lista__principal"><p className="lista__titulo">{nombreTipo(d.tipo)} · {d.numero}</p><p className="lista__meta">{d.creado_por_nombre} · {fechaCorta(d.fecha)}{d.motivo ? ` · ${d.motivo}` : ''}</p></div><StatusBadge estado="pendiente" />{esAdmin && <Link to="/aprobaciones" className="lista__accion">Revisar</Link>}</li>)}</ul></Estado></Panel>
      <Panel titulo="Productos bajo mínimo" enlace={<Link to="/stock" className="card__link">Ver stock</Link>}><Estado consulta={bajoMinimo} vacio="Todos los productos están sobre su stock mínimo."><ul className="lista">{bajoMinimo.data?.map((p) => <li key={p.producto_id} className="lista__item"><div className="lista__principal"><p className="lista__titulo">{p.nombre}</p><p className="lista__meta">{p.codigo} · Disponible {formatoStock(p.disponible, p)} · Mínimo {formatoStock(p.stock_minimo, p)}</p></div><StatusBadge estado="bajo-minimo" /><Link to="/pedidos" className="lista__accion">Crear pedido</Link></li>)}</ul></Estado></Panel>
      <Panel ancho titulo="Últimos movimientos" enlace={esAdmin && <Link to="/bitacora" className="card__link">Ver bitácora completa</Link>}><Estado consulta={movimientos} vacio="Todavía no hay movimientos registrados."><table className="table table--stack"><thead><tr><th scope="col">Documento</th><th scope="col">Tipo</th><th scope="col">Venta</th><th scope="col">Registró</th><th scope="col">Fecha</th><th scope="col">Estado</th></tr></thead><tbody>{movimientos.data?.map((m) => <tr key={m.id}><td data-label="Documento" className="num">{m.numero}</td><td data-label="Tipo">{nombreTipo(m.tipo)}</td><td data-label="Venta">{m.doc_venta_numero ? `${DOC_VENTA[m.doc_venta_tipo]} ${m.doc_venta_numero}` : '—'}</td><td data-label="Registró">{m.creado_por_nombre}</td><td data-label="Fecha">{fechaCorta(m.fecha)}</td><td data-label="Estado"><StatusBadge estado={m.estado} /></td></tr>)}</tbody></table></Estado></Panel>
    </div>
  </section>;
}
