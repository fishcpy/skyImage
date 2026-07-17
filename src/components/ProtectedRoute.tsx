import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { fetchProfile } from "@/lib/api";
import { useAuthStore } from "@/state/auth";

export function ProtectedRoute() {
  const token = useAuthStore((state) => state.token);
  const setAuth = useAuthStore((state) => state.setAuth);
  const location = useLocation();
  const [bootstrapping, setBootstrapping] = useState(!token);

  useEffect(() => {
    if (token) {
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchProfile();
        if (!cancelled && user) {
          setAuth({ user });
        }
      } catch {
        // no valid session cookie
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, setAuth]);

  if (bootstrapping) {
    return null;
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <>
      <AuthSessionWatcher />
      <Outlet />
    </>
  );
}

const REFRESH_INTERVAL = 10_000;

function AuthSessionWatcher() {
  const token = useAuthStore((state) => state.token);
  const refreshUser = useAuthStore((state) => state.refreshUser);

  useEffect(() => {
    if (!token) return;
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    let isUnmounted = false;
    let inFlight = false;

    const runRefresh = async () => {
      if (isUnmounted || inFlight) {
        return;
      }
      inFlight = true;
      try {
        await refreshUser();
      } finally {
        inFlight = false;
      }
    };

    runRefresh();

    const handleFocus = () => {
      runRefresh();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(runRefresh, REFRESH_INTERVAL);

    return () => {
      isUnmounted = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [token, refreshUser]);

  return null;
}
