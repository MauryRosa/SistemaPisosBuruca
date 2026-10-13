import Icon from './Icon.jsx';

// Tarjeta de resumen: ícono, número grande y etiqueta corta
export default function StatCard({ icon, value, label, alert = false, loading = false }) {
  return (
    <article className={`card stat-card${alert ? ' stat-card--alert' : ''}`}>
      <span className="stat-card__icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="stat-card__value">{loading ? '—' : value}</p>
        <p className="stat-card__label">{label}</p>
      </div>
    </article>
  );
}
