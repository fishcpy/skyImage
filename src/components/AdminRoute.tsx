import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "@/state/auth";

export function AdminRoute() {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (!user?.isAdmin) {
    return <Navigate to="/dashboard" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
