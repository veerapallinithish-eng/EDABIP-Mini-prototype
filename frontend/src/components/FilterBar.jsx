export default function FilterBar({ departments, filters, onChange, onReset }) {
  return (
    <section className="filter-bar" aria-label="Dashboard filters">
      <label>
        Department
        <select
          value={filters.department}
          onChange={(event) => onChange({ ...filters, department: event.target.value })}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department} value={department}>{department}</option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => onChange({ ...filters, from: event.target.value })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => onChange({ ...filters, to: event.target.value })}
        />
      </label>
      <button type="button" className="button button-secondary filter-reset" onClick={onReset}>
        Reset filters
      </button>
    </section>
  );
}
