export const TIPOS_DOCUMENTO = {
  entrada_compra: 'Entrada por compra', entrada_devolucion_cliente: 'Devolución de cliente', entrada_cambio: 'Entrada por cambio', inventario_inicial: 'Inventario inicial', salida_venta: 'Salida por venta', despacho_minibodega: 'Despacho desde minibodega', traslado: 'Traslado', merma: 'Merma', consumo_interno: 'Consumo interno', devolucion_proveedor: 'Devolución a proveedor', salida_cambio: 'Salida por cambio', ajuste_positivo: 'Ajuste positivo', ajuste_negativo: 'Ajuste negativo', apertura_caja: 'Apertura de caja', anulacion: 'Anulación',
};
export const DOC_VENTA = { factura: 'Factura', ccf: 'CCF', recibo: 'Recibo' };
export function nombreTipo(tipo) { return TIPOS_DOCUMENTO[tipo] || tipo; }
export function fechaCorta(fecha) { return new Date(fecha).toLocaleString('es-SV', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
