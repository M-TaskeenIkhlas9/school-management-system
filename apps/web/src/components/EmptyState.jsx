import Icon from "../app/Icon.jsx";

/** What to show when a list is empty: an icon, what's missing, and what to do about it. */
export default function EmptyState({ icon = "search", title, children, action }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
