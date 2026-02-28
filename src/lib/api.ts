import axios from "axios";
import { useAuthStore } from "@/state/auth";

const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";

export const apiClient = axios.create({
  baseURL: apiBase,
  withCredentials: false
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
      useAuthStore.getState().markDisabled();
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
  const res = await apiClient.get<{ data: InstallerStatus }>(
    "/installer/status"
  );
  return res.data.data;
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
  const res = await apiClient.post<{ data: { token: string; user: any } }>(
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
  const res = await apiClient.post<{ data: any }>("/auth/register", payload);
  return res.data.data;
}

export async function fetchRegistrationStatus() {
  const res = await apiClient.get<{ data: { allowed: boolean; emailVerifyEnabled: boolean } }>("/auth/registration-status");
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

export type SiteConfig = {
  title: string;
  description: string;
  about: string;
  enableGallery: boolean;
  enableApi: boolean;
  version?: string;
  accountDisabledNotice?: string;
};

export async function fetchSiteConfig() {
  const res = await apiClient.get<{ data: SiteConfig }>("/site/config");
  return res.data.data;
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

export async function fetchFiles() {
  const res = await apiClient.get<{ data: FileRecord[] }>("/files");
  return res.data.data;
}

export async function deleteFile(id: number) {
  await apiClient.delete(`/files/${id}`);
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

export async function fetchAdminImages(params?: { limit?: number; offset?: number }) {
  const res = await apiClient.get<{ data: FileRecord[] }>("/admin/images", {
    params
  });
  return res.data.data;
}

export async function deleteAdminImage(id: number) {
  await apiClient.delete(`/admin/images/${id}`);
}

export type SystemSettingsInput = {
  siteTitle: string;
  siteDescription: string;
  about: string;
  enableGallery: boolean;
  enableApi: boolean;
  allowRegistration: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpSecure: boolean;
  enableRegisterVerify: boolean;
  enableLoginNotification: boolean;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  enableTurnstile: boolean;
  accountDisabledNotice: string;
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
