import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { InstallerPage } from "@/features/installer/InstallerPage";
import { UploadPage } from "@/features/files/UploadPage";
import { UserManagementPage } from "@/features/users/UserManagementPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { fetchInstallerStatus } from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { MyImagesPage } from "@/features/files/MyImagesPage";
import { ProfileSettingsPage } from "@/features/settings/ProfileSettingsPage";
import { GalleryPage } from "@/features/gallery/GalleryPage";
import { ApiDocsPage } from "@/features/api/ApiDocsPage";
import { AdminConsolePage } from "@/features/admin/AdminDashboard";
import { AdminGroupsPage } from "@/features/admin/AdminGroupsPage";
import { AdminImagesPage } from "@/features/admin/AdminImagesPage";
import { AdminStrategiesPage } from "@/features/admin/AdminStrategiesPage";
import { AdminSystemSettingsPage } from "@/features/admin/AdminSystemSettingsPage";
import { AdminGroupEditorPage } from "@/features/admin/AdminGroupEditorPage";
import { AdminStrategyEditorPage } from "@/features/admin/AdminStrategyEditorPage";
import { AdminUserCreatePage } from "@/features/users/AdminUserCreatePage";
import { AdminUserDetailPage } from "@/features/users/AdminUserDetailPage";
import { AboutPage } from "@/features/about/AboutPage";
import { AdminRoute } from "@/components/AdminRoute";
import { SiteMetaWatcher } from "@/components/SiteMetaWatcher";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/features/misc/NotFoundPage";
export default function App() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ["installer"],
        queryFn: fetchInstallerStatus
    });
    if (isLoading) {
        return _jsx(SplashScreen, {});
    }
    if (error) {
        return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center", children: [_jsx("p", { className: "text-lg font-semibold", children: "\u65E0\u6CD5\u83B7\u53D6\u7CFB\u7EDF\u72B6\u6001" }), _jsx("p", { className: "text-sm text-muted-foreground", children: error instanceof Error ? error.message : "请确认后端服务已启动并监听 /api。" }), _jsx(Button, { onClick: () => refetch(), children: "\u91CD\u8BD5\u8FDE\u63A5" })] }));
    }
    const installed = data?.installed;
    return (_jsxs(_Fragment, { children: [_jsx(SiteMetaWatcher, { active: Boolean(installed) }), _jsxs(Routes, { children: [_jsx(Route, { path: "/installer", element: _jsx(InstallerPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), installed && (_jsxs(Route, { element: _jsx(ProtectedRoute, {}), children: [_jsxs(Route, { path: "/dashboard/*", element: _jsx(AppShell, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "upload", element: _jsx(UploadPage, {}) }), _jsx(Route, { path: "images", element: _jsx(MyImagesPage, {}) }), _jsx(Route, { path: "settings", element: _jsx(ProfileSettingsPage, {}) }), _jsx(Route, { path: "gallery", element: _jsx(GalleryPage, {}) }), _jsx(Route, { path: "api", element: _jsx(ApiDocsPage, {}) }), _jsx(Route, { path: "about", element: _jsx(AboutPage, {}) }), _jsxs(Route, { element: _jsx(AdminRoute, {}), children: [_jsx(Route, { path: "admin", element: _jsx(Navigate, { to: "admin/console", replace: true }) }), _jsx(Route, { path: "admin/console", element: _jsx(AdminConsolePage, {}) }), _jsx(Route, { path: "admin/groups", element: _jsx(AdminGroupsPage, {}) }), _jsx(Route, { path: "admin/groups/new", element: _jsx(AdminGroupEditorPage, {}) }), _jsx(Route, { path: "admin/groups/:id", element: _jsx(AdminGroupEditorPage, {}) }), _jsx(Route, { path: "admin/users", element: _jsx(UserManagementPage, {}) }), _jsx(Route, { path: "admin/users/new", element: _jsx(AdminUserCreatePage, {}) }), _jsx(Route, { path: "admin/users/:id", element: _jsx(AdminUserDetailPage, {}) }), _jsx(Route, { path: "admin/images", element: _jsx(AdminImagesPage, {}) }), _jsx(Route, { path: "admin/strategies", element: _jsx(AdminStrategiesPage, {}) }), _jsx(Route, { path: "admin/strategies/new", element: _jsx(AdminStrategyEditorPage, {}) }), _jsx(Route, { path: "admin/strategies/:id", element: _jsx(AdminStrategyEditorPage, {}) }), _jsx(Route, { path: "admin/settings", element: _jsx(AdminSystemSettingsPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(NotFoundPage, { homePath: "/dashboard" }) })] }), _jsx(Route, { path: "/", element: _jsx(Navigate, { to: "/dashboard", replace: true }) })] })), _jsx(Route, { path: "*", element: installed ? (_jsx(NotFoundPage, { homePath: "/dashboard" })) : (_jsx(Navigate, { to: "/installer" })) })] })] }));
}
