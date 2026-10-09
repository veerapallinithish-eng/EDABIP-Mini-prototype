import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationBell from './NotificationBell';

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

export default function Navbar({ collapsed, onToggleSidebar }) {
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
    <aside className={`sidebar${collapsed ? ' sidebar-is-collapsed' : ''}`}>
      <div className="sidebar-header">
        <NavLink className="brand" to="/dashboard" aria-label="EDABIP dashboard" title="EDABIP dashboard">
          <span className="brand-mark">E</span>
          <span className="brand-name nav-label">EDABIP<span>INSIGHTS</span></span>
        </NavLink>
        <button
          type="button"
          className="icon-button sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      <nav className="sidebar-links" aria-label="Main navigation">
        <NavLink to="/dashboard" aria-label="Dashboard" title="Dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon" aria-hidden="true">▦</span><span className="nav-label">Dashboard</span>
        </NavLink>
        <NavLink to="/data" aria-label="Data management" title="Data management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
          <span className="nav-icon" aria-hidden="true">▤</span><span className="nav-label">Data management</span>
        </NavLink>
        {user?.role === 'admin' && (
          <NavLink to="/users" aria-label="User management" title="User management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            <span className="nav-icon" aria-hidden="true">♙</span><span className="nav-label">User management</span>
          </NavLink>
        )}
      </nav>
      <div className="sidebar-bottom">
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
        <NavLink className="user-menu" to="/profile" aria-label="Profile" title="Profile">
          <span className="avatar-pill">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
          <span className="user-menu-name nav-label">{user?.name || 'User'}<small>{user?.role}</small></span>
        </NavLink>
        <button type="button" className="button button-quiet logout-button" onClick={handleLogout} aria-label="Log out" title="Log out">
          <span aria-hidden="true">↪</span><span className="nav-label">Log out</span>
        </button>
      </div>
    </aside>
  );
}
