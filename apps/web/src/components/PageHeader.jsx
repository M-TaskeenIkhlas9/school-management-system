export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="section__header">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
