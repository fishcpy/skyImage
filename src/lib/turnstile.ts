import { apiClient } from "./api";

export type TurnstileConfig = {
  enabled: boolean;
  siteKey?: string;
};

export async function fetchTurnstileConfig(): Promise<TurnstileConfig> {
  const res = await apiClient.get<{ data: TurnstileConfig }>("/site/turnstile");
  return res.data.data;
}

// Load Turnstile script
export function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="challenges.cloudflare.com"]')) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
}
