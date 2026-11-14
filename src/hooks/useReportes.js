import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase.js';
import { consultarPorIds, consultarTodas } from '../lib/consultarTodas.js';

const TIPOS_SALIDA = [
  'salida_venta', 'despacho_minibodega', 'merma', 'consumo_interno',
  'devolucion_proveedor', 'salida_cambio', 'traslado', 'ajuste_negativo',
];

function comprobar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data || [];
}

async function paginar(armarConsulta) {
  const filas = [];
  let desde = 0;
  while (true) {
    const pagina = comprobar(await armarConsulta().range(desde, desde + 999));
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
    desde += 1000;
  }
}

function fechasISO(desde, hasta) {
  const fin = new Date(`${hasta}T00:00:00-06:00`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return {
    inicio: new Date(`${desde}T00:00:00-06:00`).toISOString(),
    finExclusivo: fin.toISOString(),
  };
}

export function useCatalogoReportes() {
  return useQuery({
    queryKey: ['catalogo-reportes'],
    queryFn: async () => {
      const [productos, ubicaciones] = await Promise.all([
        consultarTodas(() => supabase.from('productos')
          .select('id,codigo,nombre,tipo,categoria,unidad,piezas_por_caja')
          .order('nombre')
          .order('id')),
        consultarTodas(() => supabase.from('ubicaciones')
          .select('id,nombre,tipo')
          .order('nombre')
          .order('id')),
      ]);
      return { productos, ubicaciones };
    },
  });
}

export function useReporteMovimientos(tipo, desde, hasta) {
  return useQuery({
    queryKey: ['reportes', tipo, desde, hasta],
    enabled: Boolean(['salidas', 'movimientos', 'mermas'].includes(tipo) && desde && hasta && desde <= hasta),
    queryFn: async () => {
      const { inicio, finExclusivo } = fechasISO(desde, hasta);
      const documentos = await paginar(() => {
        let consulta = supabase.from('documentos')
          .select('id,serie,anio,correlativo,tipo,fecha,estado,motivo,es_contingencia,doc_venta_tipo,doc_venta_numero,doc_proveedor_numero,retira_nombre,placa,creado_por')
          .gte('fecha', inicio)
          .lt('fecha', finExclusivo)
          .order('fecha', { ascending: false })
          .order('id', { ascending: false });
        if (tipo === 'salidas') consulta = consulta.in('tipo', TIPOS_SALIDA).eq('estado', 'aprobado');
        if (tipo === 'mermas') consulta = consulta.eq('tipo', 'merma');
        return consulta;
      });
      if (documentos.length === 0) return [];

      const ids = documentos.map((documento) => documento.id);
      const detalles = [];
      for (let i = 0; i < ids.length; i += 500) {
        detalles.push(...await paginar(() => supabase.from('detalle_documento')
          .select('id,documento_id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion,cantidad_cajas_abiertas')
          .in('documento_id', ids.slice(i, i + 500))
          .order('id')));
      }

      const productoIds = [...new Set(detalles.map((detalle) => detalle.producto_id))];
      const ubicacionIds = [...new Set(detalles.flatMap((detalle) => [detalle.ubicacion_origen_id, detalle.ubicacion_destino_id]).filter(Boolean))];
      const creadorIds = [...new Set(documentos.map((documento) => documento.creado_por).filter(Boolean))];
      const [productos, ubicaciones, usuarios] = await Promise.all([
        consultarPorIds(productoIds, (ids) => supabase.from('productos')
          .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
          .in('id', ids)),
        consultarPorIds(ubicacionIds, (ids) => supabase.from('ubicaciones')
          .select('id,nombre')
          .in('id', ids)),
        consultarPorIds(creadorIds, (ids) => supabase.from('usuarios')
          .select('id,nombre')
          .in('id', ids)),
      ]);
      const porProducto = new Map(productos.map((producto) => [producto.id, producto]));
      const porUbicacion = new Map(ubicaciones.map((ubicacion) => [ubicacion.id, ubicacion.nombre]));
      const porUsuario = new Map(usuarios.map((usuario) => [usuario.id, usuario.nombre]));
      const porDocumento = new Map(documentos.map((documento) => [documento.id, documento]));

      return detalles.map((detalle) => {
        const documento = porDocumento.get(detalle.documento_id);
        return {
          ...detalle,
          documento,
          numero: `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`,
          producto: porProducto.get(detalle.producto_id),
          origen: porUbicacion.get(detalle.ubicacion_origen_id) || '',
          destino: porUbicacion.get(detalle.ubicacion_destino_id) || '',
          creador: porUsuario.get(documento.creado_por) || 'Usuario no disponible',
        };
      }).filter((fila) => fila.documento);
    },
  });
}

export function useReporteBajoMinimo(activo = true) {
  return useQuery({
    queryKey: ['reportes', 'bajo-minimo'],
    enabled: activo,
    queryFn: () => consultarTodas(() => supabase.from('v_stock_total')
      .select('producto_id,codigo,nombre,tipo,categoria,unidad,piezas_por_caja,fisico,reservado,disponible,stock_minimo')
      .eq('bajo_minimo', true)
      .order('disponible')
      .order('producto_id')),
  });
}

export function useKardex(productoId, ubicacionId, desde, hasta) {
  return useQuery({
    queryKey: ['reportes', 'kardex', productoId, ubicacionId, desde, hasta],
    enabled: Boolean(productoId && ubicacionId && desde && hasta && desde <= hasta),
    queryFn: async () => {
      const { inicio, finExclusivo } = fechasISO(desde, hasta);
      const detalleQuery = await paginar(() => supabase.from('detalle_documento')
        .select('id,documento_id,producto_id,ubicacion_origen_id,ubicacion_destino_id,cantidad,observacion')
        .eq('producto_id', productoId)
        .or(`ubicacion_origen_id.eq.${ubicacionId},ubicacion_destino_id.eq.${ubicacionId}`)
        .order('id'));
      const documentoIds = [...new Set(detalleQuery.map((detalle) => detalle.documento_id))];
      const documentos = [];
      for (let i = 0; i < documentoIds.length; i += 500) {
        documentos.push(...comprobar(await supabase.from('documentos')
          .select('id,serie,anio,correlativo,tipo,fecha,estado,motivo,traslado_confirmado_en')
          .in('id', documentoIds.slice(i, i + 500))));
      }
      const porDocumento = new Map(documentos.map((documento) => [documento.id, documento]));
      const eventos = [];
      for (const detalle of detalleQuery) {
        const documento = porDocumento.get(detalle.documento_id);
        if (!documento || documento.estado !== 'aprobado' || documento.tipo === 'apertura_caja') continue;
        const numero = `${documento.serie}-${documento.anio}-${String(documento.correlativo).padStart(5, '0')}`;
        if (detalle.ubicacion_origen_id === Number(ubicacionId)) {
          eventos.push({ fecha: documento.fecha, numero, tipo: documento.tipo, cantidad: detalle.cantidad, delta: -detalle.cantidad, observacion: detalle.observacion });
        }
        if (detalle.ubicacion_destino_id === Number(ubicacionId)) {
          const fecha = documento.tipo === 'traslado' ? documento.traslado_confirmado_en : documento.fecha;
          if (fecha) eventos.push({ fecha, numero, tipo: documento.tipo, cantidad: detalle.cantidad, delta: detalle.cantidad, observacion: detalle.observacion });
        }
      }
      eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero) || a.delta - b.delta);

      const existenciaResultado = await supabase.from('existencias')
        .select('cantidad')
        .eq('producto_id', productoId)
        .eq('ubicacion_id', ubicacionId)
        .maybeSingle();
      if (existenciaResultado.error) throw existenciaResultado.error;
      const stockActual = Number(existenciaResultado.data?.cantidad) || 0;
      const { data: productoData, error: productoError } = await supabase.from('productos')
        .select('id,codigo,nombre,tipo,unidad,piezas_por_caja')
        .eq('id', productoId)
        .single();
      if (productoError) throw productoError;
      const { data: ubicacionData, error: ubicacionError } = await supabase.from('ubicaciones')
        .select('id,nombre')
        .eq('id', ubicacionId)
        .single();
      if (ubicacionError) throw ubicacionError;

      const movimientosDesde = eventos.filter((evento) => evento.fecha >= inicio);
      const saldoInicial = stockActual - movimientosDesde.reduce((suma, evento) => suma + evento.delta, 0);
      const movimientosPeriodo = eventos.filter((evento) => evento.fecha >= inicio && evento.fecha < finExclusivo);
      let saldo = saldoInicial;
      const filas = movimientosPeriodo.map((evento) => {
        saldo += evento.delta;
        return { ...evento, saldo };
      });
      return { filas, saldoInicial, saldoFinal: saldo, producto: productoData, ubicacion: ubicacionData };
    },
  });
}
