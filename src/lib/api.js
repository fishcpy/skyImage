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
apiClient.interceptors.response.use((response) => response, (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.error || error.message || "Unknown error";
    const normalized = String(message).toLowerCase();
    const shouldFlagDisabled = status === 403 && normalized.includes("account disabled");
    if (shouldFlagDisabled) {
        useAuthStore.getState().markDisabled();
    }
    const wrappedError = new Error(message);
    wrappedError.status = status;
    return Promise.reject(wrappedError);
});
export async function fetchInstallerStatus() {
    const res = await apiClient.get("/installer/status");
    return res.data.data;
}
export async function runInstaller(payload) {
    const res = await apiClient.post("/installer/run", payload);
    return res.data.data;
}
export async function login(payload) {
    const res = await apiClient.post("/auth/login", payload);
    return res.data.data;
}
export async function register(payload) {
    const res = await apiClient.post("/auth/register", payload);
    return res.data.data;
}
export async function fetchProfile() {
    const res = await apiClient.get("/auth/me");
    return res.data.data;
}
export async function fetchHasUsers() {
    const res = await apiClient.get("/auth/needs-setup");
    return res.data.data.hasUsers;
}
export async function fetchAdminMetrics() {
    const res = await apiClient.get("/admin/metrics");
    return res.data.data;
}
export async function fetchSiteConfig() {
    const res = await apiClient.get("/site/config");
    return res.data.data;
}
export async function fetchGalleryPublic(params) {
    const res = await apiClient.get("/gallery/public", {
        params
    });
    return res.data.data;
}
export async function fetchAdminSettings() {
    const res = await apiClient.get("/admin/settings");
    return res.data.data;
}
export async function updateAdminSettings(input) {
    await apiClient.put("/admin/settings", input);
}
export async function fetchUsers() {
    const res = await apiClient.get("/admin/users");
    return res.data.data;
}
export async function updateUserStatus(userId, status) {
    await apiClient.patch(`/admin/users/${userId}/status`, { status });
}
export async function toggleUserAdmin(userId, admin) {
    await apiClient.post(`/admin/users/${userId}/admin`, { admin });
}
export async function createUser(payload) {
    const res = await apiClient.post("/admin/users", payload);
    return res.data.data;
}
export async function deleteUserAccount(userId) {
    await apiClient.delete(`/admin/users/${userId}`);
}
export async function fetchFiles() {
    const res = await apiClient.get("/files");
    return res.data.data;
}
export async function deleteFile(id) {
    await apiClient.delete(`/files/${id}`);
}
export async function uploadFile(payload) {
    const formData = new FormData();
    formData.append("file", payload.file);
    formData.append("visibility", payload.visibility);
    if (payload.strategyId) {
        formData.append("strategyId", String(payload.strategyId));
    }
    const res = await apiClient.post("/files", formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data.data;
}
export async function fetchAccountProfile() {
    const res = await apiClient.get("/account/profile");
    return res.data.data;
}
export async function updateAccountProfile(input) {
    const res = await apiClient.put("/account/profile", input);
    return res.data.data;
}
export async function fetchGroups() {
    const res = await apiClient.get("/admin/groups");
    return res.data.data;
}
export async function saveGroup(input) {
    if (input.id) {
        const res = await apiClient.put(`/admin/groups/${input.id}`, input);
        return res.data.data;
    }
    const res = await apiClient.post("/admin/groups", input);
    return res.data.data;
}
export async function deleteGroup(id) {
    await apiClient.delete(`/admin/groups/${id}`);
}
export async function fetchUploadStrategies() {
    const res = await apiClient.get("/files/strategies");
    return res.data.data;
}
export async function fetchStrategies() {
    const res = await apiClient.get("/admin/strategies");
    return res.data.data;
}
export async function saveStrategy(input) {
    if (input.id) {
        const res = await apiClient.put(`/admin/strategies/${input.id}`, input);
        return res.data.data;
    }
    const res = await apiClient.post("/admin/strategies", input);
    return res.data.data;
}
export async function deleteStrategy(id) {
    await apiClient.delete(`/admin/strategies/${id}`);
}
export async function fetchUserDetail(userId) {
    const res = await apiClient.get(`/admin/users/${userId}`);
    return res.data.data;
}
export async function assignUserGroup(userId, groupId) {
    const res = await apiClient.patch(`/admin/users/${userId}/group`, { groupId });
    return res.data.data;
}
export async function fetchAdminImages(params) {
    const res = await apiClient.get("/admin/images", {
        params
    });
    return res.data.data;
}
export async function deleteAdminImage(id) {
    await apiClient.delete(`/admin/images/${id}`);
}
export async function fetchSystemSettings() {
    const res = await apiClient.get("/admin/system");
    return res.data.data;
}
export async function updateSystemSettings(input) {
    await apiClient.put("/admin/system", input);
}
export async function testSmtpEmail(payload) {
    const res = await apiClient.post("/admin/system/test-smtp", payload);
    return res.data.data;
}
export async function testTurnstileConfig(payload) {
    const res = await apiClient.post("/admin/system/test-turnstile", payload);
    return res.data.data;
}
