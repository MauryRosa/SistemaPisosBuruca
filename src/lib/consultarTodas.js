export async function consultarTodas(crearConsulta, tamanoPagina = 500) {
  const resultados = [];

  for (let desde = 0; ; desde += tamanoPagina) {
    const { data, error } = await crearConsulta().range(desde, desde + tamanoPagina - 1);
    if (error) throw error;

    const pagina = data || [];
    resultados.push(...pagina);
    if (pagina.length < tamanoPagina) return resultados;
  }
}
