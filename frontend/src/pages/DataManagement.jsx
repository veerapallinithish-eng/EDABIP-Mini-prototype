import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import Pagination from '../components/Pagination';
import ToastContainer from '../components/ToastContainer';
import useDebounce from '../hooks/useDebounce';
import useForm from '../hooks/useForm';
import useToast from '../hooks/useToast';
import { parseCsv } from '../utils/csv';
import { useAuth } from '../context/AuthContext';

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export default function DataManagement() {
  const { user } = useAuth();
  const { values, handleChange, reset } = useForm({
    department: '',
    metric_name: '',
    metric_value: '',
    recorded_on: today(),
  });
  const { toasts, pushToast, removeToast } = useToast();
  const [departments, setDepartments] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [filters, setFilters] = useState({ department: '', from: '', to: '' });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvError, setCsvError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const pages = Math.max(1, Math.ceil(total / 10));

  useEffect(() => {
    api.get('/departments')
      .then((response) => setDepartments(response.data))
      .catch((error) => setFormError(error.response?.data?.error || 'Could not load departments.'));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = {
      page,
      limit: 10,
      search: debouncedSearch,
      ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    };
    api.get('/metrics', { params })
      .then((response) => {
        if (!active) return;
        setRows(response.data.items);
        setTotal(response.data.total);
      })
      .catch((error) => {
        if (active) pushToast(error.response?.data?.error || 'Could not load metric records.', 'error');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, debouncedSearch, filters, pushToast]);

  const previewRows = useMemo(() => csvRows.slice(0, 5), [csvRows]);

  const handleAddMetric = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await api.post('/metrics', { ...values, metric_value: Number(values.metric_value) });
      pushToast('Metric record added successfully.');
      reset();
      setPage(1);
      const response = await api.get('/metrics', {
        params: { page: 1, limit: 10, search: debouncedSearch, ...filters },
      });
      setRows(response.data.items);
      setTotal(response.data.total);
    } catch (error) {
      setFormError(error.response?.data?.error || 'Could not add metric record.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    setCsvFile(null);
    setCsvRows([]);
    setCsvError('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError('Choose a .csv file.');
      event.target.value = '';
      return;
    }
    try {
      const parsed = parseCsv(await file.text());
      setCsvFile(file);
      setCsvRows(parsed);
    } catch (error) {
      setCsvError(error.message || 'Could not read this CSV file.');
      event.target.value = '';
    }
  };

  const handleUpload = async () => {
    if (!csvFile) return;
    setUploading(true);
    setCsvError('');
    const data = new FormData();
    data.append('file', csvFile);
    try {
      const response = await api.post('/metrics/upload', data);
      pushToast(response.data.message);
      setCsvFile(null);
      setCsvRows([]);
      const input = document.getElementById('metric-csv');
      if (input) input.value = '';
      setPage(1);
      const refreshed = await api.get('/metrics', { params: { page: 1, limit: 10, ...filters } });
      setRows(refreshed.data.items);
      setTotal(refreshed.data.total);
    } catch (error) {
      setCsvError(error.response?.data?.error || 'Could not upload this CSV file.');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (metricId) => {
    if (!window.confirm(`Delete metric record #${metricId}? This cannot be undone.`)) return;
    setDeletingId(metricId);
    try {
      await api.delete(`/metrics/${metricId}`);
      pushToast(`Metric record #${metricId} deleted.`);
      if (rows.length === 1 && page > 1) setPage((current) => current - 1);
      else {
        const refreshed = await api.get('/metrics', {
          params: { page, limit: 10, search: debouncedSearch, ...filters },
        });
        setRows(refreshed.data.items);
        setTotal(refreshed.data.total);
      }
    } catch (error) {
      pushToast(error.response?.data?.error || 'Could not delete metric record.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="page-shell data-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Data management</h1>
          <p className="page-subtitle">Add, review, and import trusted departmental metrics.</p>
        </div>
      </header>

      <section className="panel content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Manual entry</p><h2>Add a metric record</h2></div>
        </div>
        {formError && <div className="error-box form-error" role="alert">{formError}</div>}
        <form className="metric-form" onSubmit={handleAddMetric}>
          <label>Department
            <select name="department" value={values.department} onChange={handleChange} required>
              <option value="">Choose department</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>Metric name
            <input name="metric_name" value={values.metric_name} onChange={handleChange} maxLength="100" required />
          </label>
          <label>Value
            <input name="metric_value" type="number" step="any" value={values.metric_value} onChange={handleChange} required />
          </label>
          <label>Recorded on
            <input name="recorded_on" type="date" value={values.recorded_on} onChange={handleChange} required />
          </label>
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Add record'}
          </button>
        </form>
      </section>

      <section className="panel content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Bulk import</p><h2>Upload CSV data</h2></div>
          <span className="chart-caption">Up to 10,000 records · 5 MB</span>
        </div>
        <div className="upload-controls">
          <label className="file-picker">Choose CSV file
            <input id="metric-csv" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          </label>
          {csvFile && <span className="file-name">{csvFile.name} · {csvRows.length} rows</span>}
          <button className="button button-primary" type="button" disabled={!csvFile || uploading} onClick={handleUpload}>
            {uploading ? 'Uploading…' : 'Upload all'}
          </button>
        </div>
        {csvError && <div className="error-box form-error" role="alert">{csvError}</div>}
        {previewRows.length > 0 && (
          <div className="csv-preview">
            <p className="preview-label">Preview · first {previewRows.length} of {csvRows.length} rows</p>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Department</th><th>Metric name</th><th>Value</th><th>Recorded on</th></tr></thead>
                <tbody>{previewRows.map((row, index) => (
                  <tr key={`${row.metric_name}-${index}`}>
                    <td>{row.department}</td><td>{row.metric_name}</td><td>{row.metric_value}</td><td>{row.recorded_on}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        <p className="csv-hint">Required headers: department, metric_name, metric_value, recorded_on.</p>
      </section>

      <section className="panel content-panel">
        <div className="panel-heading records-heading">
          <div><p className="eyebrow">Data catalogue</p><h2>Metric records</h2></div>
          <span className="record-total">{total.toLocaleString()} total</span>
        </div>
        <div className="table-filters">
          <label className="search-field">Search by metric
            <input type="search" value={search} placeholder="e.g. Revenue" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          </label>
          <label>Department
            <select value={filters.department} onChange={(event) => { setFilters({ ...filters, department: event.target.value }); setPage(1); }}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </label>
          <label>From
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => { setFilters({ ...filters, from: event.target.value }); setPage(1); }} />
          </label>
          <label>To
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => { setFilters({ ...filters, to: event.target.value }); setPage(1); }} />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Department</th><th>Metric</th><th>Value</th><th>Date</th><th>Uploaded by</th>{user?.role === 'admin' && <th>Action</th>}</tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={user?.role === 'admin' ? 6 : 5} className="table-message">Loading records…</td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row.id}>
                  <td><span className="department-tag">{row.department_name}</span></td>
                  <td>{row.metric_name}</td>
                  <td className="numeric-cell">{Number(row.metric_value).toLocaleString()}</td>
                  <td>{new Date(`${row.recorded_on}T00:00:00`).toLocaleDateString()}</td>
                  <td>{row.uploaded_by_name}</td>
                  {user?.role === 'admin' && (
                    <td><button className="text-button danger-text" type="button" disabled={deletingId === row.id} onClick={() => handleDelete(row.id)}>
                      {deletingId === row.id ? 'Deleting…' : 'Delete'}
                    </button></td>
                  )}
                </tr>
              )) : <tr><td colSpan={user?.role === 'admin' ? 6 : 5} className="table-message">No records match these filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pages={pages} total={total} onPageChange={setPage} />
      </section>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
