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

export async function consultarPorIds(ids, crearConsulta, tamanoGrupo = 200) {
  const resultados = [];

  for (let inicio = 0; inicio < ids.length; inicio += tamanoGrupo) {
    const grupo = ids.slice(inicio, inicio + tamanoGrupo);
    resultados.push(...await consultarTodas(() => crearConsulta(grupo)));
  }

  return resultados;
}
