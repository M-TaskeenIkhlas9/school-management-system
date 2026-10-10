/** Prev/next controls for a paginated API response ({ page, totalPages, total }). */
export default function Pagination({ data, onPageChange }) {
  if (!data || data.total === 0) return null;
  const { page, totalPages, total } = data;
  return (
    <div className="pagination">
      <span className="muted">
        Page {page} of {totalPages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="pagination__buttons">
        <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Prev
        </button>
        <button type="button" className="btn ghost small" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}
