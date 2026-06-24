import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Turnstile, type TurnstileRef } from "./Turnstile";
import { loadTurnstileScript } from "@/lib/turnstile";
import { loadGeetestScript } from "@/lib/geetest";

export type CaptchaProvider = "cloudflare" | "geetest";

export interface UnifiedCaptchaProps {
  provider: CaptchaProvider;
  siteKey: string;
  onVerify: (token: string, extraData?: Record<string, string>) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export interface UnifiedCaptchaRef {
  reset: () => void;
}

export const UnifiedCaptcha = forwardRef<UnifiedCaptchaRef, UnifiedCaptchaProps>(
  ({ provider, siteKey, onVerify, onError, onExpire }, ref) => {
    const [ready, setReady] = useState(false);
    const turnstileRef = useRef<TurnstileRef>(null);
    const geetestRef = useRef<any>(null);
    const geetestInitialized = useRef(false);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (provider === "cloudflare" && turnstileRef.current) {
          turnstileRef.current.reset();
        } else if (provider === "geetest" && geetestRef.current) {
          geetestRef.current.reset();
        }
      }
    }));

    useEffect(() => {
      if (provider === "cloudflare") {
        loadTurnstileScript()
          .then(() => setReady(true))
          .catch((err) => {
            console.error("Failed to load Turnstile:", err);
            onError?.();
          });
      } else if (provider === "geetest") {
        loadGeetestScript()
          .then(() => setReady(true))
          .catch((err) => {
            console.error("Failed to load Geetest:", err);
            onError?.();
          });
      }
    }, [provider, onError]);

    if (provider === "cloudflare") {
      return ready ? (
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onVerify={onVerify}
          onError={onError}
          onExpire={onExpire}
        />
      ) : (
        <div className="flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground">加载验证组件中...</div>
        </div>
      );
    }

    if (provider === "geetest") {
      return ready ? (
        <div
          id="geetest-captcha"
          className="flex items-center justify-center"
          ref={(el) => {
            if (el && !geetestInitialized.current) {
              // 等待 window.initGeetest4 就绪后再标记已初始化，避免竞态
              if (!(window as any).initGeetest4) {
                // API 尚未就绪，延迟重试
                const retry = () => {
                  if (geetestInitialized.current) return;
                  if ((window as any).initGeetest4) {
                    geetestInitialized.current = true;
                    initGeetest4(el, siteKey, (captchaObj) => {
                      geetestRef.current = captchaObj;
                    }, onVerify, onError);
                  } else {
                    setTimeout(retry, 100);
                  }
                };
                setTimeout(retry, 100);
                return;
              }
              geetestInitialized.current = true;
              initGeetest4(el, siteKey, (captchaObj) => {
                geetestRef.current = captchaObj;
              }, onVerify, onError);
            }
          }}
        />
      ) : (
        <div className="flex items-center justify-center p-4">
          <div className="text-sm text-muted-foreground">加载极验组件中...</div>
        </div>
      );
    }

    return null;
  }
);

UnifiedCaptcha.displayName = "UnifiedCaptcha";

// Helper function to initialize Geetest v4
function initGeetest4(
  element: HTMLElement,
  captchaId: string,
  onCaptchaReady: (captchaObj: any) => void,
  onVerify: (token: string, extraData?: Record<string, string>) => void,
  onError?: () => void
): void {
  if (typeof window === "undefined" || !(window as any).initGeetest4) {
    return;
  }

  (window as any).initGeetest4(
    {
      captchaId: captchaId,
      product: "popup",
    },
    (captchaObj: any) => {
      onCaptchaReady(captchaObj);

      captchaObj.onSuccess(() => {
        const result = captchaObj.getValidate();
        if (result) {
          onVerify(result.lot_number, {
            challenge: result.lot_number,
            validate: result.pass_token,
            seccode: result.gen_time,
            captcha_output: result.captcha_output,
          });
        }
      });

      captchaObj.onError(() => {
        onError?.();
      });

      captchaObj.appendTo(element);
    }
  );
}
