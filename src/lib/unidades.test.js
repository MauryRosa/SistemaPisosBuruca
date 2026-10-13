import { describe, expect, it } from 'vitest';
import { aPiezas, desglosar, formatoStock, nombreUnidad } from './unidades.js';

const piso = { tipo: 'piso', piezas_por_caja: 2, unidad: 'pieza' };
const pegamento = { tipo: 'accesorio', piezas_por_caja: null, unidad: 'bolsa' };

describe('unidades', () => {
  it('convierte cajas + piezas a piezas', () => { expect(aPiezas(5, 1, 4)).toBe(21); });
  it('desglosa piezas en cajas completas y sueltas', () => { expect(desglosar(21, 2)).toEqual({ cajas: 10, sueltas: 1, piezas: 21 }); });
  it('muestra el ejemplo de RF-34: 10 cajas de 2 + 1 pieza', () => {
    expect(formatoStock(21, piso)).toBe('Cajas 10 · Piezas 21');
    expect(formatoStock(20, piso)).toBe('Cajas 10 · Piezas 20');
  });
  it('muestra accesorios en su unidad', () => {
    expect(formatoStock(12, pegamento)).toBe('12 bolsas');
    expect(formatoStock(1, pegamento)).toBe('1 bolsa');
    expect(nombreUnidad('galon', 3)).toBe('galones');
  });
  it('nunca muestra cantidades negativas', () => { expect(formatoStock(-3, piso)).toBe('Cajas 0 · Piezas 0'); });
});
