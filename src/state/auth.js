import { create } from "zustand";
const storageKey = "lsky-auth";
const normalizeUser = (user) => {
    if (!user)
        return null;
    const statusValue = user.status ??
        user.Status ??
        user.account_status ??
        user.accountStatus ??
        1;
    const status = typeof statusValue === "number"
        ? statusValue
        : Number.parseInt(String(statusValue), 10);
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin ?? user.is_adminer ?? user.IsAdmin ?? false,
        isSuperAdmin: user.isSuperAdmin ??
            user.is_super_admin ??
            user.IsSuperAdmin ??
            false,
        capacity: user.capacity ??
            user.Capacity ??
            user.capacity_in_bytes ??
            user.capacityBytes ??
            0,
        usedCapacity: user.usedCapacity ??
            user.use_capacity ??
            user.UseCapacity ??
            user.used_capacity ??
            0,
        defaultVisibility: readDefaultVisibility(user),
        defaultStrategyId: readDefaultStrategy(user),
        groupId: user.groupId ?? user.group?.id ?? null,
        themePreference: readThemePreference(user),
        status: Number.isFinite(status) ? status : 1
    };
};
const readDefaultVisibility = (user) => {
    const configs = user.configs ??
        user.Configs ??
        user.preferences ??
        user.preferences_json ??
        null;
    if (!configs)
        return "private";
    try {
        const parsed = typeof configs === "string" ? JSON.parse(configs) : configs;
        const raw = parsed?.default_visibility ?? parsed?.defaultVisibility;
        return raw === "public" ? "public" : "private";
    }
    catch {
        return "private";
    }
};
const readDefaultStrategy = (user) => {
    const configs = user.configs ??
        user.Configs ??
        user.preferences ??
        user.preferences_json ??
        null;
    if (!configs)
        return undefined;
    try {
        const parsed = typeof configs === "string" ? JSON.parse(configs) : configs;
        const raw = parsed?.default_strategy ??
            parsed?.defaultStrategy ??
            parsed?.configs?.default_strategy;
        const id = Number(raw);
        return Number.isFinite(id) && id > 0 ? id : undefined;
    }
    catch {
        return undefined;
    }
};
const readThemePreference = (user) => {
    const configs = user.configs ??
        user.Configs ??
        user.preferences ??
        user.preferences_json ??
        null;
    if (!configs)
        return "system";
    try {
        const parsed = typeof configs === "string" ? JSON.parse(configs) : configs;
        const raw = parsed?.theme_preference ??
            parsed?.theme ??
            parsed?.themePreference;
        return raw === "light" || raw === "dark" ? raw : "system";
    }
    catch {
        return "system";
    }
};
const readStorage = () => {
    if (typeof window === "undefined") {
        return { token: null, user: null };
    }
    const raw = window.localStorage.getItem(storageKey);
    if (!raw)
        return { token: null, user: null };
    try {
        const parsed = JSON.parse(raw);
        return { token: parsed.token, user: normalizeUser(parsed.user) };
    }
    catch {
        return { token: null, user: null };
    }
};
export const useAuthStore = create((set, get) => ({
    token: null,
    user: null,
    setAuth: (payload) => {
        const normalizedUser = normalizeUser(payload.user);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, JSON.stringify({ token: payload.token, user: normalizedUser }));
        }
        set({ token: payload.token, user: normalizedUser });
    },
    clear: () => {
        if (typeof window !== "undefined") {
            window.localStorage.removeItem(storageKey);
        }
        set({ token: null, user: null });
    },
    hydrate: () => {
        const snapshot = readStorage();
        set(snapshot);
    },
    setUser: (user) => {
        const normalizedUser = normalizeUser(user);
        set({ user: normalizedUser });
        if (typeof window !== "undefined") {
            const token = get().token;
            window.localStorage.setItem(storageKey, JSON.stringify({ token, user: normalizedUser }));
        }
    },
    markDisabled: () => {
        const currentUser = get().user;
        if (!currentUser || currentUser.status === 0) {
            return;
        }
        const disabledUser = { ...currentUser, status: 0 };
        set({ user: disabledUser });
        if (typeof window !== "undefined") {
            const token = get().token;
            window.localStorage.setItem(storageKey, JSON.stringify({ token, user: disabledUser }));
        }
    },
    refreshUser: async () => {
        const token = get().token;
        if (!token) {
            console.log('[Auth] No token, skipping refresh');
            return;
        }
        console.log('[Auth] Refreshing user...');
        try {
            // Dynamically import to avoid circular dependency
            const { fetchProfile } = await import("@/lib/api");
            const userData = await fetchProfile();
            console.log('[Auth] Fetched user data:', userData);
            const normalizedUser = normalizeUser(userData);
            console.log('[Auth] Normalized user:', normalizedUser);
            if (!normalizedUser) {
                console.warn('[Auth] Missing normalized user, clearing session');
                get().clear();
                return;
            }
            set({ user: normalizedUser });
            if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, JSON.stringify({ token, user: normalizedUser }));
            }
            console.log('[Auth] User refreshed successfully');
        }
        catch (error) {
            console.error('[Auth] Failed to refresh user:', error);
            const status = error?.status;
            const message = error?.message?.toLowerCase?.();
            const disabled = status === 403 && message?.includes("account disabled");
            if (disabled) {
                console.warn('[Auth] Refresh detected disabled account');
                get().markDisabled();
                return;
            }
        }
    }
}));
