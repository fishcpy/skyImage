import axios from "axios";
import { useAuthStore } from "@/state/auth";

const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
const disabledNoticeKey = "skyimage-disabled-notice";

export const apiClient = axios.create({
  baseURL: apiBase,
  withCredentials: true
});

function getCookie(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  const encoded = encodeURIComponent(name) + "=";
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(encoded)) {
      return decodeURIComponent(trimmed.slice(encoded.length));
    }
  }
  return "";
}

apiClient.interceptors.request.use((config) => {
  const method = (config.method || "get").toLowerCase();
  if (method === "post" || method === "put" || method === "patch" || method === "delete") {
    const csrf = getCookie("skyimage_csrf");
    if (csrf) {
      config.headers = config.headers || {};
      config.headers["X-CSRF-Token"] = csrf;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.error || error.message || "Unknown error";
    const normalized = String(message).toLowerCase();

    const shouldFlagDisabled =
      status === 403 && normalized.includes("account disabled");

    if (shouldFlagDisabled) {
      useAuthStore.getState().clear();
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(disabledNoticeKey, "1");
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      }
    }

    const wrappedError: Error & { status?: number } = new Error(message);
    wrappedError.status = status;
    return Promise.reject(wrappedError);
  }
);

export type InstallerStatus = {
  installed: boolean;
  siteName?: string;
  version?: string;
};

export async function fetchInstallerStatus() {
  try {
    const res = await apiClient.get<{ data: InstallerStatus }>(
      "/installer/status"
    );
    return res.data.data;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) {
      return { installed: true };
    }
    throw error;
  }
}

export async function runInstaller(payload: {
  databaseType?: string;
  databasePath?: string;
  databaseHost?: string;
  databasePort?: string;
  databaseName?: string;
  databaseUser?: string;
  databasePassword?: string;
  siteName: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}) {
  const res = await apiClient.post<{ data: InstallerStatus }>(
    "/installer/run",
    payload
  );
  return res.data.data;
}

export async function login(payload: { email: string; password: string; turnstileToken?: string }) {
  const res = await apiClient.post<{ data: { user: any } }>(
    "/auth/login",
    payload
  );
  return res.data.data;
}

export async function sendVerificationCode(payload: { email: string; turnstileToken?: string }) {
  const res = await apiClient.post<{ data: { message: string } }>("/auth/send-verification-code", payload);
  return res.data.data;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  verificationCode: string;
  turnstileToken?: string;
}) {
  const res = await apiClient.post<{ data: { user: any } }>("/auth/register", payload);
  return res.data.data;
}

export async function logout() {
  await apiClient.post("/auth/logout");
}

export async function fetchRegistrationStatus() {
  const res = await apiClient.get<{ data: { allowed: boolean; emailVerifyEnabled: boolean; forgotPasswordEnabled: boolean } }>("/auth/registration-status");
  return res.data.data;
}

export async function requestPasswordReset(payload: { email: string; turnstileToken?: string }) {
  const res = await apiClient.post<{ data: { message: string } }>("/auth/forgot-password", payload);
  return res.data.data;
}

export async function resetPasswordByEmail(payload: {
  token: string;
  code: string;
  password: string;
  turnstileToken?: string;
}) {
  const res = await apiClient.post<{ data: { message: string } }>("/auth/reset-password", payload);
  return res.data.data;
}

export type ResetPasswordStatus = {
  valid: boolean;
  requiresTurnstile: boolean;
};

export async function fetchResetPasswordStatus(token: string) {
  const res = await apiClient.get<{ data: ResetPasswordStatus }>("/auth/reset-password-status", {
    params: { token }
  });
  return res.data.data;
}

export async function fetchProfile() {
  const res = await apiClient.get<{ data: any }>("/auth/me");
  return res.data.data;
}

export async function fetchHasUsers() {
  const res = await apiClient.get<{ data: { hasUsers: boolean } }>(
    "/auth/needs-setup"
  );
  return res.data.data.hasUsers;
}

export async function fetchAdminMetrics() {
  const res = await apiClient.get<{ data: any }>("/admin/metrics");
  return res.data.data;
}

export type TrendData = {
  date: string;
  uploads: number;
  registrations: number;
};

export async function fetchAdminTrends(days: number = 90): Promise<TrendData[]> {
  const res = await apiClient.get<{ data: TrendData[] }>(`/admin/trends?days=${days}`);
  return res.data.data;
}

export type UserTrendData = {
  date: string;
  uploads: number;
};

export async function fetchUserTrends(days: number = 90): Promise<UserTrendData[]> {
  const res = await apiClient.get<{ data: UserTrendData[] }>(`/files/trends?days=${days}`);
  return res.data.data;
}

export type SiteConfig = {
  title: string;
  description: string;
  slogan?: string;
  logo?: string;
  homeBadgeText?: string;
  homeIntroText?: string;
  homePrimaryCtaText?: string;
  homeDashboardCtaText?: string;
  homeSecondaryCtaText?: string;
  homeFeature1Title?: string;
  homeFeature1Desc?: string;
  homeFeature2Title?: string;
  homeFeature2Desc?: string;
  homeFeature3Title?: string;
  homeFeature3Desc?: string;
  about: string;
  aboutTitle?: string;
  notFoundMode?: string;
  notFoundHeading?: string;
  notFoundText?: string;
  notFoundHtml?: string;
  termsOfService?: string;
  privacyPolicy?: string;
  enableGallery: boolean;
  enableHome?: boolean;
  enableApi: boolean;
  forgotPasswordEnabled?: boolean;
  forgotPasswordTurnstileRequest?: boolean;
  forgotPasswordTurnstileReset?: boolean;
  imageLoadRows?: number;
  version?: string;
  accountDisabledNotice?: string;
};

export async function fetchSiteConfig() {
  const res = await apiClient.get<{ data: SiteConfig }>("/site/config");
  const config = res.data.data;
  
  try {
    localStorage.setItem("skyimage-site-config", JSON.stringify(config));
  } catch (error) {
    console.warn("Failed to cache site config:", error);
  }
  
  return config;
}

export async function fetchGalleryPublic(params?: {
  limit?: number;
  offset?: number;
}) {
  const res = await apiClient.get<{ data: FileRecord[] }>("/gallery/public", {
    params
  });
  return res.data.data;
}

export async function fetchAdminSettings() {
  const res = await apiClient.get<{ data: Record<string, string> }>(
    "/admin/settings"
  );
  return res.data.data;
}

export async function updateAdminSettings(input: Record<string, string>) {
  await apiClient.put("/admin/settings", input);
}

export async function fetchUsers() {
  const res = await apiClient.get<{ data: any[] }>("/admin/users");
  return res.data.data;
}

export async function updateUserStatus(userId: number, status: number) {
  await apiClient.patch(`/admin/users/${userId}/status`, { status });
}

export async function toggleUserAdmin(userId: number, admin: boolean) {
  await apiClient.post(`/admin/users/${userId}/admin`, { admin });
}

export type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
};

export async function createUser(payload: CreateUserPayload) {
  const res = await apiClient.post<{ data: any }>("/admin/users", payload);
  return res.data.data;
}

export async function deleteUserAccount(userId: number) {
  await apiClient.delete(`/admin/users/${userId}`);
}

export async function fetchFiles(params?: { limit?: number; offset?: number }) {
  const res = await apiClient.get<{ data: FileRecord[] }>("/files", { params });
  return res.data.data;
}

export async function deleteFile(id: number) {
  await apiClient.delete(`/files/${id}`);
}

export async function updateFileVisibility(id: number, visibility: "public" | "private") {
  const res = await apiClient.patch<{ data: FileRecord }>(`/files/${id}/visibility`, {
    visibility
  });
  return res.data.data;
}

export async function updateFilesVisibilityBatch(
  ids: number[],
  visibility: "public" | "private"
) {
  const res = await apiClient.patch<{ data: { updated: number } }>(
    "/files/batch/visibility",
    { ids, visibility }
  );
  return res.data.data;
}

export async function deleteFilesBatch(ids: number[]) {
  const res = await apiClient.post<{ data: { deleted: number } }>(
    "/files/batch/delete",
    { ids }
  );
  return res.data.data;
}

export async function uploadFile(payload: {
  file: File;
  visibility: "public" | "private";
  strategyId?: number;
}) {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("visibility", payload.visibility);
  if (payload.strategyId) {
    formData.append("strategyId", String(payload.strategyId));
  }
  const res = await apiClient.post<{ data: FileRecord }>(
    "/files",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" }
    }
  );
  return res.data.data;
}

export type FileAuditRecord = {
  status: "none" | "approved" | "pending" | "rejected" | "error";
  decision?: "pass" | "review" | "block" | "error";
  provider?: string;
  riskLevel?: string;
  label?: string;
  nsfwScore?: number;
  confidence?: number;
  message?: string;
  checkedAt?: string;
  reviewedAt?: string;
};

export type FileRecord = {
  id: number;
  key: string;
  originalName: string;
  size: number;
  viewUrl: string;
  directUrl: string;
  visibility: string;
  markdown: string;
  html: string;
  createdAt: string;
  ownerName?: string;
  ownerEmail?: string;
  strategyId?: number;
  strategyName?: string;
  relativePath?: string;
  storageDriver?: string;
  audit?: FileAuditRecord;
};

export async function fetchAccountProfile() {
  const res = await apiClient.get<{ data: any }>("/account/profile");
  return res.data.data;
}

export async function updateAccountProfile(input: {
  name: string;
  url: string;
  password?: string;
  defaultVisibility?: "public" | "private";
  theme?: "light" | "dark" | "system";
}) {
  const res = await apiClient.put<{ data: any }>("/account/profile", input);
  return res.data.data;
}

export async function deleteAccount() {
  await apiClient.delete("/account/profile");
}

export type UserNotificationMetadata = {
  fileId?: number;
  fileKey?: string;
  fileOriginalName?: string;
  reasonType?: "audit_block_delete" | "audit_error_delete" | "admin_delete";
  auditMessage?: string;
  adminReason?: string;
};

export type UserNotificationRecord = {
  id: number;
  type: string;
  title: string;
  message: string;
  metadata: UserNotificationMetadata;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
};

export async function fetchAccountNotifications(params?: {
  status?: "all" | "unread" | "read";
  limit?: number;
  offset?: number;
}) {
  const res = await apiClient.get<{ data: UserNotificationRecord[] }>(
    "/account/notifications",
    { params }
  );
  return res.data.data;
}

export async function updateAccountNotificationRead(id: number, read = true) {
  const res = await apiClient.patch<{ data: UserNotificationRecord }>(
    `/account/notifications/${id}/read`,
    { read }
  );
  return res.data.data;
}

export async function markAllAccountNotificationsRead() {
  const res = await apiClient.post<{ data: { updated: number } }>(
    "/account/notifications/read-all"
  );
  return res.data.data;
}

export async function clearAccountNotifications() {
  const res = await apiClient.delete<{ data: { deleted: number } }>(
    "/account/notifications"
  );
  return res.data.data;
}

export type GroupRecord = {
  id: number;
  name: string;
  isDefault: boolean;
  isGuest?: boolean;
  configs: Record<string, any>;
};

export async function fetchGroups() {
  const res = await apiClient.get<{ data: GroupRecord[] }>("/admin/groups");
  return res.data.data;
}

export async function saveGroup(input: Partial<GroupRecord> & { name: string }) {
  if (input.id) {
    const res = await apiClient.put<{ data: GroupRecord }>(
      `/admin/groups/${input.id}`,
      input
    );
    return res.data.data;
  }
  const res = await apiClient.post<{ data: GroupRecord }>("/admin/groups", input);
  return res.data.data;
}

export async function deleteGroup(id: number) {
  await apiClient.delete(`/admin/groups/${id}`);
}

export type StrategyRecord = {
  id: number;
  key: number;
  name: string;
  intro: string;
  configs: Record<string, any>;
  groups?: GroupRecord[];
  groupIds?: number[];
};

export type UserStrategyOption = {
  id: number;
  name: string;
  intro: string;
};

export async function fetchUploadStrategies() {
  const res = await apiClient.get<{
    data: { strategies: UserStrategyOption[]; defaultStrategyId?: number };
  }>("/files/strategies");
  return res.data.data;
}

export async function fetchStrategies() {
  const res = await apiClient.get<{ data: StrategyRecord[] }>(
    "/admin/strategies"
  );
  return res.data.data;
}

export async function saveStrategy(
  input: Partial<StrategyRecord> & { name: string }
) {
  if (input.id) {
    const res = await apiClient.put<{ data: StrategyRecord }>(
      `/admin/strategies/${input.id}`,
      input
    );
    return res.data.data;
  }
  const res = await apiClient.post<{ data: StrategyRecord }>(
    "/admin/strategies",
    input
  );
  return res.data.data;
}

export async function deleteStrategy(id: number) {
  await apiClient.delete(`/admin/strategies/${id}`);
}

export type AuditProfileRecord = {
  id: number;
  name: string;
  provider: string;
  configs: Record<string, any>;
};

export async function fetchAuditProfiles() {
  const res = await apiClient.get<{ data: AuditProfileRecord[] }>("/admin/audits");
  return res.data.data;
}

export async function saveAuditProfile(
  input: Partial<AuditProfileRecord> & { name: string }
) {
  if (input.id) {
    const res = await apiClient.put<{ data: AuditProfileRecord }>(
      `/admin/audits/${input.id}`,
      input
    );
    return res.data.data;
  }
  const res = await apiClient.post<{ data: AuditProfileRecord }>("/admin/audits", input);
  return res.data.data;
}

export async function deleteAuditProfile(id: number) {
  await apiClient.delete(`/admin/audits/${id}`);
}

export async function fetchUserDetail(userId: number) {
  const res = await apiClient.get<{ data: any }>(`/admin/users/${userId}`);
  return res.data.data;
}

export async function assignUserGroup(userId: number, groupId: number | null) {
  const res = await apiClient.patch<{ data: any }>(
    `/admin/users/${userId}/group`,
    { groupId }
  );
  return res.data.data;
}

export async function fetchAdminImages(params?: {
  limit?: number;
  offset?: number;
  auditStatus?: string;
}) {
  const res = await apiClient.get<{ data: FileRecord[] }>("/admin/images", {
    params
  });
  return res.data.data;
}

export async function deleteAdminImage(id: number, reason?: string) {
  await apiClient.delete(`/admin/images/${id}`, {
    data: reason ? { reason } : undefined
  });
}

export async function updateAdminImageVisibility(
  id: number,
  visibility: "public" | "private"
) {
  const res = await apiClient.patch<{ data: FileRecord }>(
    `/admin/images/${id}/visibility`,
    { visibility }
  );
  return res.data.data;
}

export async function updateAdminImageAuditStatus(
  id: number,
  status: "approved"
) {
  const res = await apiClient.patch<{ data: FileRecord }>(
    `/admin/images/${id}/audit-status`,
    { status }
  );
  return res.data.data;
}

export async function updateAdminImagesVisibilityBatch(
  ids: number[],
  visibility: "public" | "private"
) {
  const res = await apiClient.patch<{ data: { updated: number } }>(
    "/admin/images/batch/visibility",
    { ids, visibility }
  );
  return res.data.data;
}

export async function deleteAdminImagesBatch(ids: number[], reason?: string) {
  const res = await apiClient.post<{ data: { deleted: number } }>(
    "/admin/images/batch/delete",
    { ids, reason }
  );
  return res.data.data;
}

export type SystemSettingsInput = {
  siteTitle: string;
  consoleUrl: string;
  siteDescription: string;
  siteSlogan: string;
  siteLogo: string;
  homeBadgeText: string;
  homeIntroText: string;
  homePrimaryCtaText: string;
  homeDashboardCtaText: string;
  homeSecondaryCtaText: string;
  homeFeature1Title: string;
  homeFeature1Desc: string;
  homeFeature2Title: string;
  homeFeature2Desc: string;
  homeFeature3Title: string;
  homeFeature3Desc: string;
  about: string;
  aboutTitle: string;
  notFoundMode: string;
  notFoundHeading: string;
  notFoundText: string;
  notFoundHtml: string;
  termsOfService: string;
  privacyPolicy: string;
  enableGallery: boolean;
  enableHome: boolean;
  enableApi: boolean;
  imageLoadRows: number;
  allowRegistration: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpFrom: string;
  smtpSecure: boolean;
  enableRegisterVerify: boolean;
  enableLoginNotification: boolean;
  enableForgotPassword: boolean;
  enableForgotPasswordTurnstile: boolean;
  enableForgotPasswordTurnstileRequest: boolean;
  enableForgotPasswordTurnstileReset: boolean;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  enableTurnstile: boolean;
  enableLoginTurnstile: boolean;
  enableRegisterTurnstile: boolean;
  enableRegisterVerifyTurnstile: boolean;
  accountDisabledNotice: string;
  userNotificationLimit: number;
  adminImageDeleteDefaultReason: string;
  systemAutoDeleteDefaultReason: string;
};

export type SystemSettingsResponse = SystemSettingsInput & {
  turnstileVerified: boolean;
  turnstileLastVerifiedAt?: string;
};

export async function fetchSystemSettings() {
  const res = await apiClient.get<{ data: SystemSettingsResponse }>(
    "/admin/system"
  );
  return res.data.data;
}

export async function updateSystemSettings(input: SystemSettingsInput) {
  await apiClient.put("/admin/system", input);
}

export type TestSmtpPayload = {
  testEmail: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpFrom: string;
  smtpSecure: boolean;
};

export type TestSmtpResponse = {
  success: boolean;
  message: string;
};

export async function testSmtpEmail(payload: TestSmtpPayload) {
  const res = await apiClient.post<{ data: TestSmtpResponse }>(
    "/admin/system/test-smtp",
    payload
  );
  return res.data.data;
}

export type TestTurnstilePayload = {
  siteKey: string;
  secretKey: string;
  token: string;
};

export type TestTurnstileResponse = {
  success: boolean;
  verifiedAt?: string;
  message?: string;
};

export async function testTurnstileConfig(payload: TestTurnstilePayload) {
  const res = await apiClient.post<{ data: TestTurnstileResponse }>(
    "/admin/system/test-turnstile",
    payload
  );
  return res.data.data;
}

export type LegalDefaults = {
  termsOfService: string;
  privacyPolicy: string;
};

export async function fetchLegalDefaults() {
  const res = await apiClient.get<{ data: LegalDefaults }>("/installer/defaults");
  return res.data.data;
}

export type ApiTokenResponse = {
  token: string;
};

export type ApiTokenRecord = {
  id: number;
  token: string;
  tokenMasked?: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string;
};

function readTokenField(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = value[key];
    if (typeof v === "string" && v.trim() !== "") {
      return v;
    }
  }
  return "";
}

function readNumberField(value: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const v = value[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
    if (typeof v === "string" && v.trim() !== "") {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function normalizeApiToken(value: unknown): ApiTokenRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Record<string, unknown>;
  const masked = readTokenField(source, ["tokenMasked", "token_masked", "token", "Token"]);
  if (!masked) {
    return null;
  }
  return {
    id: readNumberField(source, ["id", "ID"]),
    token: masked,
    tokenMasked: masked,
    createdAt: readTokenField(source, ["createdAt", "created_at", "CreatedAt"]),
    expiresAt: readTokenField(source, ["expiresAt", "expires_at", "ExpiresAt"]),
    lastUsedAt: readTokenField(source, ["lastUsedAt", "last_used_at", "LastUsedAt"]) || undefined
  };
}

export async function generateApiToken(input?: { expiresAt?: string }) {
  const res = await apiClient.post<{ data: ApiTokenResponse }>(
    "/account/api-token",
    input
  );
  return res.data.data;
}

export async function fetchApiTokens() {
  const res = await apiClient.get<{ data: unknown[] }>("/account/api-tokens");
  const source = Array.isArray(res.data.data) ? res.data.data : [];
  return source.map(normalizeApiToken).filter((item): item is ApiTokenRecord => item !== null);
}

export async function deleteApiToken(id: number) {
  await apiClient.delete(`/account/api-token/${id}`);
}

export async function updateApiToken(id: number, input: { expiresAt: string }) {
  await apiClient.patch(`/account/api-token/${id}`, input);
}

export async function deleteApiTokens() {
  await apiClient.delete("/account/api-token");
}
