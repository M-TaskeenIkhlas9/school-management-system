/** Checkboxes for the classes a teacher may access. */
export default function ClassPicker({ classrooms, value, onChange }) {
  if (!classrooms.length) return <p className="muted">No classes yet. Create classes first.</p>;
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="class-picker">
      {classrooms.map((c) => (
        <label key={c.id} className={`class-chip ${value.includes(c.id) ? "on" : ""}`}>
          <input type="checkbox" checked={value.includes(c.id)} onChange={() => toggle(c.id)} />
          {c.name}
          {c.section ? ` • ${c.section}` : ""}
        </label>
      ))}
    </div>
  );
}
