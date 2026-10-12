/** Page title on the ruled header line; `eyebrow` names the context, `children` hold page actions. */
export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="section__header">
      <div>
        {eyebrow && <p className="section__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="section__subtitle">{subtitle}</p>}
      </div>
      {children && <div className="section__actions">{children}</div>}
    </header>
  );
}
