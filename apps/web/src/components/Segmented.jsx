/** Tab-like choice between a few options: [[value, label, count?], …]. */
export default function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map(([key, text, count]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={value === key ? "is-active" : ""}
          onClick={() => onChange(key)}
        >
          {text}
          {count !== undefined && <span className="segmented__count">{count}</span>}
        </button>
      ))}
    </div>
  );
}
