import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

export default function Navbar() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const avatarUrl = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${API_ORIGIN}${user.avatar_url}`)
    : '';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <nav className="topbar">
      <NavLink className="brand" to="/dashboard" aria-label="EDABIP dashboard">
        <span className="brand-mark">E</span>
        <span className="brand-name">EDABIP<span>INSIGHTS</span></span>
      </NavLink>
      <div className="nav-links">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</NavLink>
        {['admin', 'analyst'].includes(user?.role) && (
          <NavLink to="/data" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Data management</NavLink>
        )}
      </div>
      <div className="nav-actions">
        {user?.role === 'admin' && <NotificationBell />}
        <button
          type="button"
          className="icon-button theme-button"
          onClick={toggleTheme}
          aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
          {isDark ? '☼' : '☾'}
        </button>
        <NavLink className="user-menu" to="/profile">
          <span className="avatar-pill">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
          <span className="user-menu-name">{user?.name || 'User'}<small>{user?.role}</small></span>
        </NavLink>
        <button type="button" className="button button-quiet logout-button" onClick={handleLogout}>Log out</button>
      </div>
    </nav>
  );
}
