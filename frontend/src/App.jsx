import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import './App.css';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const DataManagement = lazy(() => import('./pages/DataManagement'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const UserManagement = lazy(() => import('./pages/UserManagement'));

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved === null ? window.matchMedia('(max-width: 700px)').matches : saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className={`app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Navbar
        collapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <main className="app-content"><Outlet /></main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="page-loader">Loading page…</div>}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route
                      path="/data"
                      element={(
                        <RoleRoute allowedRoles={['admin', 'analyst']}>
                          <DataManagement />
                        </RoleRoute>
                      )}
                    />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route
                      path="/users"
                      element={(
                        <RoleRoute allowedRoles={['admin']}>
                          <UserManagement />
                        </RoleRoute>
                      )}
                    />
                    <Route
                      path="/403"
                      element={(
                        <section className="forbidden-page" role="alert">
                          <span className="forbidden-code">403</span>
                          <p className="eyebrow">Access restricted</p>
                          <h1>Data management is for analysts and admins</h1>
                          <p className="page-subtitle">
                            Your viewer account can explore the dashboard, but it does not have permission to manage data.
                          </p>
                          <Link className="button button-primary" to="/dashboard">Return to dashboard</Link>
                        </section>
                      )}
                    />
                  </Route>
                </Route>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
