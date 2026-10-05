import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleRoute({ allowedRoles = [], children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="page-loader">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/403" replace />;

  return children;
}
