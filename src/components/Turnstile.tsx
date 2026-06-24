import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export interface TurnstileRef {
  reset: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  ({ siteKey, onVerify, onError, onExpire }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const verifyRef = useRef(onVerify);
    const errorRef = useRef(onError);
    const expireRef = useRef(onExpire);

    useEffect(() => {
      verifyRef.current = onVerify;
    }, [onVerify]);

    useEffect(() => {
      errorRef.current = onError;
    }, [onError]);

    useEffect(() => {
      expireRef.current = onExpire;
    }, [onExpire]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
      },
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      // window.turnstile 可能尚未就绪（脚本刚加载完但 API 未初始化），轮询等待
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      let disposed = false;

      const tryRender = () => {
        if (disposed) return;
        if (!containerRef.current || !window.turnstile) {
          retryTimer = setTimeout(tryRender, 100);
          return;
        }

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            verifyRef.current?.(token);
          },
          "error-callback": () => {
            errorRef.current?.();
          },
          "expired-callback": () => {
            expireRef.current?.();
          },
          theme: "auto",
        });
      };

      tryRender();

      return () => {
        disposed = true;
        if (retryTimer) clearTimeout(retryTimer);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [siteKey]);

    return <div ref={containerRef} />;
  }
);
