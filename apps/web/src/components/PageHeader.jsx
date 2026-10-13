import Icon from "../app/Icon.jsx";

/** Page title with its section icon; `children` hold the page's main actions. */
export default function PageHeader({ eyebrow, title, subtitle, icon, tone = "blue", children }) {
  return (
    <header className="section__header">
      <div className="section__title">
        {icon && (
          <span className={`tile tile--${tone} section__icon`} aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
        )}
        <div>
          {eyebrow && <p className="section__eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="section__subtitle">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="section__actions">{children}</div>}
    </header>
  );
}
