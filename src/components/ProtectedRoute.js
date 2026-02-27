import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/state/auth";
export function ProtectedRoute() {
    const token = useAuthStore((state) => state.token);
    const location = useLocation();
    if (!token) {
        return _jsx(Navigate, { to: "/login", state: { from: location }, replace: true });
    }
    return (_jsxs(_Fragment, { children: [_jsx(AuthSessionWatcher, {}), _jsx(Outlet, {})] }));
}
const REFRESH_INTERVAL = 10000;
function AuthSessionWatcher() {
    const token = useAuthStore((state) => state.token);
    const refreshUser = useAuthStore((state) => state.refreshUser);
    useEffect(() => {
        if (!token)
            return;
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
            }
            finally {
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
