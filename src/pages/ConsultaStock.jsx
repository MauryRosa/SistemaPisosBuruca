import { useDeferredValue, useState } from 'react';
import { useFiltrosStock, useStock, useStockEnVivo } from '../hooks/useStock.js';
import { formatoStock } from '../lib/unidades.js';
import Icon from '../components/ui/Icon.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import '../css/stock.css';

// P03 · Consulta de stock (RF-34, RF-36). Pantalla principal de las vendedoras.
export default function ConsultaStock() {
  const [busqueda, setBusqueda] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false);
  const busquedaDiferida = useDeferredValue(busqueda);

  useStockEnVivo();
  const { data: filtros } = useFiltrosStock();
  const {
    data: filas = [],
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = useStock({
    busqueda: busquedaDiferida,
    ubicacionId: ubicacionId ? Number(ubicacionId) : null,
    categoria,
    soloBajoMinimo,
  });

  const porUbicacion = Boolean(ubicacionId);
  const hora = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <section className="pagina">
      <header className="pagina__encabezado">
        <div>
          <h1>Consulta de stock</h1>
          <p>Existencia física, reservada y disponible para vender, en cajas y piezas.</p>
        </div>
      </header>

      <div className="filtros" role="search">
        <label className="filtros__busqueda">
          <span className="sr-only">Buscar por código o nombre</span>
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Buscar por código o nombre"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <div className="filtros__fila">
          <label>
            <span className="sr-only">Ubicación</span>
            <select
              className="input"
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
            >
              <option value="">Todas las ubicaciones</option>
              {filtros?.ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Categoría</span>
            <select
              className="input"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {filtros?.categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="filtros__check">
          <input
            type="checkbox"
            checked={soloBajoMinimo}
            disabled={porUbicacion}
            onChange={(e) => setSoloBajoMinimo(e.target.checked)}
          />
          Solo bajo mínimo
        </label>
      </div>

      <div className="card">
        <div className="stock__resumen">
          <span>
            {isLoading
              ? 'Consultando…'
              : `${filas.length} producto${filas.length === 1 ? '' : 's'}`}
            {porUbicacion ? '' : ' · total de bodega principal y minibodega'}
          </span>
          {hora && <span className="stock__vivo">Actualizado {hora} · en tiempo real</span>}
        </div>

        {isLoading && <EmptyState loading title="Consultando existencias…" />}

        {isError && (
          <EmptyState icon="alerta" title="No se pudo cargar el stock.">
            <button type="button" className="btn btn--secondary" onClick={() => refetch()}>
              Reintentar
            </button>
          </EmptyState>
        )}

        {!isLoading && !isError && filas.length === 0 && (
          <EmptyState icon="search" title="No hay productos que coincidan con la búsqueda." />
        )}

        {!isLoading && !isError && filas.length > 0 && (
          <div className="tabla-scroll">
            <table className="table table--stack stock-tabla">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  {porUbicacion && <th scope="col">Ubicación</th>}
                  <th scope="col">Físico</th>
                  <th scope="col">Reservado</th>
                  <th scope="col">Disponible</th>
                  <th scope="col">
                    <span className="sr-only">Estado</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.producto_id}-${f.ubicacion_id ?? 'total'}`}>
                    <td>
                      <p className="producto__nombre">{f.nombre}</p>
                      <p className="producto__meta">
                        {f.codigo} · {f.categoria}
                        {f.medida ? ` · ${f.medida}` : ''}
                      </p>
                      {!porUbicacion && f.en_exhibicion > 0 && (
                        <p className="producto__meta">
                          En exhibición: {formatoStock(f.en_exhibicion, f)}
                        </p>
                      )}
                    </td>
                    {porUbicacion && <td data-label="Ubicación">{f.ubicacion}</td>}
                    <td data-label="Físico" className="cantidad">
                      {formatoStock(f.fisico, f)}
                    </td>
                    <td data-label="Reservado" className="cantidad">
                      {formatoStock(f.reservado, f)}
                    </td>
                    <td
                      data-label="Disponible"
                      className={`cantidad cantidad--disponible${f.disponible === 0 ? ' cantidad--cero' : ''}`}
                    >
                      {formatoStock(f.disponible, f)}
                    </td>
                    <td data-label="">{f.bajo_minimo && <StatusBadge estado="bajo-minimo" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
