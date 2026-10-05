export default function Pagination({ page, pages, total, onPageChange }) {
  if (!total) return null;
  return (
    <div className="pagination">
      <span>
        Showing page {page} of {pages} · {total.toLocaleString()} records
      </span>
      <div>
        <button
          className="button button-secondary"
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          className="button button-secondary"
          type="button"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
