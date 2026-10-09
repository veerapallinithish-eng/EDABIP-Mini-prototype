import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

const ROLES = ['admin', 'analyst', 'viewer'];

export default function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/users')
      .then((response) => setUsers(response.data))
      .catch((requestError) => {
        setError(requestError.response?.data?.error || 'Could not load users.');
      })
      .finally(() => setLoading(false));
  }, []);

  const changeRole = async (target, role) => {
    setError('');
    setMessage('');
    setSavingUserId(target.id);
    try {
      const response = await api.put(`/users/${target.id}/role`, { role });
      setUsers((current) => current.map((item) => (
        item.id === target.id ? { ...item, ...response.data } : item
      )));
      setMessage(`Updated ${target.name}'s role to ${role}.`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not update this user role.');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>User management</h1>
          <p className="page-subtitle">Review accounts and assign the access each person needs.</p>
        </div>
      </header>

      {error && <div className="error-box page-error" role="alert">{error}</div>}
      {message && <div className="success-box page-error" role="status">{message}</div>}

      <section className="panel content-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Accounts</p><h2>Platform users</h2></div>
          <span className="chart-caption">{users.length} users</span>
        </div>
        {loading ? (
          <div className="table-message" role="status">Loading users…</div>
        ) : users.length ? (
          <div className="table-scroll">
            <table className="users-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <tr key={account.id}>
                    <td>{account.name}{account.id === currentUser?.id && <span className="current-user-label">You</span>}</td>
                    <td>{account.email}</td>
                    <td>
                      <label className="sr-only" htmlFor={`user-role-${account.id}`}>Role for {account.name}</label>
                      <select
                        id={`user-role-${account.id}`}
                        value={account.role}
                        disabled={account.id === currentUser?.id || savingUserId === account.id}
                        onChange={(event) => changeRole(account, event.target.value)}
                      >
                        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td>{account.created_at ? new Date(account.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-message">No users were found.</div>
        )}
      </section>
    </div>
  );
}
