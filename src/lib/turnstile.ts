import { apiClient } from "./api";

export type TurnstileConfig = {
  enabled: boolean;
  siteKey?: string;
};

export async function fetchTurnstileConfig(
  scenario: "login" | "register" | "register_verify" | "forgot_password_request" = "login"
): Promise<TurnstileConfig> {
  const res = await apiClient.get<{ data: TurnstileConfig }>(`/site/turnstile/${scenario}`);
  return res.data.data;
}

// Load Turnstile script
export function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 脚本已加载且 API 就绪
    if (window.turnstile) {
      resolve();
      return;
    }

    // 脚本标签已存在（可能正在加载中），轮询等待 API 就绪
    if (document.querySelector('script[src*="challenges.cloudflare.com"]')) {
      waitForTurnstile(resolve, reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = () => waitForTurnstile(resolve, reject);
    script.onerror = () => reject(new Error("Failed to load Turnstile script"));
    document.head.appendChild(script);
  });
}

function waitForTurnstile(resolve: () => void, reject: (err: Error) => void) {
  let attempts = 0;
  const check = () => {
    if (window.turnstile) {
      resolve();
      return;
    }
    attempts++;
    if (attempts > 50) {
      reject(new Error("Turnstile API not available after script load"));
      return;
    }
    setTimeout(check, 100);
  };
  check();
}
