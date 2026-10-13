import EmptyState from '../components/ui/EmptyState.jsx';

// Pantallas que se desarrollan en las siguientes iteraciones
export default function EnConstruccion({ titulo }) {
  return (
    <section className="pagina">
      <header className="pagina__encabezado">
        <h1>{titulo}</h1>
      </header>
      <div className="card">
        <EmptyState icon="reloj" title="Esta pantalla se está desarrollando.">
          <p className="text-muted">Estará disponible en una próxima versión del sistema.</p>
        </EmptyState>
      </div>
    </section>
  );
}
