// Logo de Pisos Buruca (isotipo "PB" + nombre)
export default function Logo({ claro = false, subtitulo = 'Sistema de Control de Inventario' }) {
  return (
    <div className={`logo${claro ? ' logo--claro' : ''}`}>
      <span className="logo__iso" aria-hidden="true">
        PB
      </span>
      <span className="logo__texto">
        <strong>Pisos Buruca</strong>
        {subtitulo && <small>{subtitulo}</small>}
      </span>
    </div>
  );
}
