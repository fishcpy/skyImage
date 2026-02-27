const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
function resolveApiOrigin() {
    if (typeof window === "undefined")
        return "";
    try {
        return new URL(apiBase, window.location.origin).origin;
    }
    catch {
        return window.location.origin;
    }
}
function joinWithApiOrigin(path) {
    const origin = resolveApiOrigin();
    if (!origin)
        return path;
    const trimmed = path.replace(/^\/+/, "");
    return `${origin}/${trimmed}`;
}
export function normalizeFileUrl(url) {
    if (!url)
        return "";
    let clean = url.trim();
    if (!clean)
        return "";
    clean = clean.replace(/\?token=[^&]+/i, "");
    if (/^https?:\/\//i.test(clean)) {
        return clean;
    }
    if (clean.startsWith("//")) {
        return `${window.location.protocol}${clean}`;
    }
    if (clean.startsWith("/")) {
        return `${resolveApiOrigin()}${clean}`;
    }
    return joinWithApiOrigin(clean);
}
