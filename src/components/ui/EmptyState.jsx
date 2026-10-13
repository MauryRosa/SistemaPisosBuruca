import Icon from './Icon.jsx';

// Estado vacío o de carga con mensaje
export default function EmptyState({ icon = 'box', title, children, loading = false }) {
  return (
    <div className="empty-state" role={loading ? 'status' : undefined}>
      {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name={icon} size={32} />}
      {title && <p>{title}</p>}
      {children}
    </div>
  );
}
