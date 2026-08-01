import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DASHBOARD = { student: "/student", lecturer: "/lecturer", admin: "/admin" };

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to={DASHBOARD[user?.role] || "/"} replace />;
  }

  return children;
}
