let loadPromise: Promise<void> | null = null;

export function loadCapWidget(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cap widget requires a browser environment"));
  }

  if (customElements.get("cap-widget")) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = import("cap-widget")
    .then(() => {
      if (customElements.get("cap-widget")) {
        return;
      }
      return customElements.whenDefined("cap-widget").then(() => undefined);
    })
    .catch((err) => {
      loadPromise = null;
      throw err instanceof Error ? err : new Error("Failed to load Cap widget");
    });

  return loadPromise;
}

export function buildCapApiEndpoint(instanceUrl: string, siteKey: string): string {
  const base = instanceUrl.trim().replace(/\/+$/, "");
  const key = siteKey.trim();
  if (!base || !key) {
    return "";
  }
  return `${base}/${key}/`;
}
