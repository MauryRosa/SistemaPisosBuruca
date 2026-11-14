const PREFIJOS_FORMULA = new Set(['=', '+', '-', '@', '＝', '＋', '－', '＠']);

function tienePrefijoPeligroso(texto) {
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0);
    if (codigo <= 0x1f) return true;
    if (caracter === '\uFEFF' || /\s/u.test(caracter)) continue;
    return PREFIJOS_FORMULA.has(caracter);
  }
  return false;
}

export function valorCSV(valor) {
  const texto = String(valor ?? '');
  const protegido = tienePrefijoPeligroso(texto) ? `'${texto}` : texto;
  return `"${protegido.replaceAll('"', '""')}"`;
}
