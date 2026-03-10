import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { InstallerPage } from "@/features/installer/InstallerPage";
import { UploadPage } from "@/features/files/UploadPage";
import { UserManagementPage } from "@/features/users/UserManagementPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { fetchInstallerStatus, fetchSiteConfig } from "@/lib/api";
import { SplashScreen } from "@/components/SplashScreen";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/layouts/AppShell";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { MyImagesPage } from "@/features/files/MyImagesPage";
import { ProfileSettingsPage } from "@/features/settings/ProfileSettingsPage";
import { GalleryPage } from "@/features/gallery/GalleryPage";
import { ApiDocsPage } from "@/features/api/ApiDocsPage";
import { ApiTokensPage } from "@/features/api/ApiTokensPage";
import { AdminConsolePage } from "@/features/admin/AdminDashboard";
import { AdminGroupsPage } from "@/features/admin/AdminGroupsPage";
import { AdminImagesPage } from "@/features/admin/AdminImagesPage";
import { AdminStrategiesPage } from "@/features/admin/AdminStrategiesPage";
import { AdminSystemSettingsPage } from "@/features/admin/AdminSystemSettingsPage";
import { AdminSiteSettingsPage } from "@/features/admin/AdminSiteSettingsPage";
import { AdminSmtpSettingsPage } from "@/features/admin/AdminSmtpSettingsPage";
import { AdminTurnstileSettingsPage } from "@/features/admin/AdminTurnstileSettingsPage";
import { AdminGroupEditorPage } from "@/features/admin/AdminGroupEditorPage";
import { AdminStrategyEditorPage } from "@/features/admin/AdminStrategyEditorPage";
import { AdminUserCreatePage } from "@/features/users/AdminUserCreatePage";
import { AdminUserDetailPage } from "@/features/users/AdminUserDetailPage";
import { AboutPage } from "@/features/about/AboutPage";
import { TermsPage } from "@/features/legal/TermsPage";
import { PrivacyPage } from "@/features/legal/PrivacyPage";
import { AdminRoute } from "@/components/AdminRoute";
import { SiteMetaWatcher } from "@/components/SiteMetaWatcher";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/features/misc/NotFoundPage";
import { HomePage } from "@/features/home/HomePage";

function HomeEntry() {
  const getCachedConfig = () => {
    try {
      const cached = localStorage.getItem("skyimage-site-config");
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  };

  const { data: siteConfig, isLoading } = useQuery({
    queryKey: ["site-config"],
    queryFn: fetchSiteConfig,
    initialData: getCachedConfig,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (typeof window === "undefined" || siteConfig?.enableHome === undefined) {
      return;
    }
    window.localStorage.setItem("site-config:enable-home", String(siteConfig.enableHome));
  }, [siteConfig?.enableHome]);

  if (siteConfig && siteConfig.enableHome === false) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading && !siteConfig) {
    return <div className="min-h-screen bg-background" />;
  }

  return <HomePage siteConfig={siteConfig} />;
}

export default function App() {
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ["installer"],
    queryFn: fetchInstallerStatus
  });

  if (isLoading) {
    return <SplashScreen />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-4 text-center">
        <p className="text-lg font-semibold">无法获取系统状态</p>
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "请确认后端服务已启动并监听 /api。"}
        </p>
        <Button onClick={() => refetch()}>重试连接</Button>
      </div>
    );
  }

  const installed = data?.installed;

  return (
    <>
      <SiteMetaWatcher active={Boolean(installed)} />
      <Routes>
        {!installed && <Route path="/installer" element={<InstallerPage />} />}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        {installed && <Route path="/" element={<HomeEntry />} />}
        {installed && (
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard/*" element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="upload" element={<UploadPage />} />
              <Route path="images" element={<MyImagesPage />} />
              <Route path="settings" element={<ProfileSettingsPage />} />
              <Route path="gallery" element={<GalleryPage />} />
              <Route path="api" element={<ApiDocsPage />} />
              <Route path="api-tokens" element={<ApiTokensPage />} />
              <Route path="about" element={<AboutPage />} />

              <Route element={<AdminRoute />}>
                <Route path="admin" element={<Navigate to="admin/console" replace />} />
                <Route path="admin/console" element={<AdminConsolePage />} />
                <Route path="admin/groups" element={<AdminGroupsPage />} />
                <Route path="admin/groups/new" element={<AdminGroupEditorPage />} />
                <Route path="admin/groups/:id" element={<AdminGroupEditorPage />} />
                <Route path="admin/users" element={<UserManagementPage />} />
                <Route path="admin/users/new" element={<AdminUserCreatePage />} />
                <Route path="admin/users/:id" element={<AdminUserDetailPage />} />
                <Route path="admin/images" element={<AdminImagesPage />} />
                <Route path="admin/strategies" element={<AdminStrategiesPage />} />
                <Route path="admin/strategies/new" element={<AdminStrategyEditorPage />} />
                <Route path="admin/strategies/:id" element={<AdminStrategyEditorPage />} />
                <Route path="admin/settings" element={<Navigate to="admin/settings/site" replace />} />
                <Route path="admin/settings/site" element={<AdminSiteSettingsPage />} />
                <Route path="admin/settings/smtp" element={<AdminSmtpSettingsPage />} />
                <Route path="admin/settings/system" element={<AdminSystemSettingsPage />} />
                <Route path="admin/settings/turnstile" element={<AdminTurnstileSettingsPage />} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        )}
        <Route
          path="*"
          element={
            installed ? (
              <NotFoundPage />
            ) : (
              <Navigate to="/installer" />
            )
          }
        />
      </Routes>
    </>
  );
}
