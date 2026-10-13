const PLURALES = {
  pieza: ['pieza', 'piezas'], bolsa: ['bolsa', 'bolsas'], unidad: ['unidad', 'unidades'],
  paquete: ['paquete', 'paquetes'], galon: ['galón', 'galones'],
};

export function nombreUnidad(unidad, cantidad) {
  const [singular, plural] = PLURALES[unidad] || [unidad, unidad];
  return cantidad === 1 ? singular : plural;
}
export function aPiezas(cajas, piezas, piezasPorCaja) {
  return (Number(cajas) || 0) * (Number(piezasPorCaja) || 0) + (Number(piezas) || 0);
}
export function desglosar(cantidad, piezasPorCaja) {
  const total = Math.max(0, Number(cantidad) || 0);
  if (!piezasPorCaja) return { cajas: 0, sueltas: total, piezas: total };
  return { cajas: Math.floor(total / piezasPorCaja), sueltas: total % piezasPorCaja, piezas: total };
}
export function formatoStock(cantidad, producto) {
  if (producto.tipo === 'piso') {
    const { cajas, piezas } = desglosar(cantidad, producto.piezas_por_caja);
    return `Cajas ${cajas} · Piezas ${piezas}`;
  }
  const total = Math.max(0, Number(cantidad) || 0);
  return `${total} ${nombreUnidad(producto.unidad, total)}`;
}
