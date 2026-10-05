import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
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

function AppLayout() {
  return (
    <>
      <Navbar />
      <main className="app-content"><Outlet /></main>
    </>
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
                    <Route path="/403" element={<div className="placeholder-page">403: Access denied</div>} />
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
