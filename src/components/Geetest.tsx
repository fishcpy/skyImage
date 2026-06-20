import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";

export interface GeetestRef {
  reset: () => void;
}

interface GeetestProps {
  captchaId: string;
  onSuccess: (result: { lot_number: string; pass_token: string; gen_time: string; captcha_output: string }) => void;
  onError: (error?: string) => void;
  onReady?: () => void;
}

declare global {
  interface Window {
    initGeetest4: (config: any, callback: (captcha: any) => void) => void;
  }
}

export const Geetest = forwardRef<GeetestRef, GeetestProps>(
  ({ captchaId, onSuccess, onError, onReady }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const captchaRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (captchaRef.current) {
          captchaRef.current.reset();
        }
      }
    }));

    useEffect(() => {
      if (!containerRef.current || !captchaId) return;

      // 防止重复初始化
      if (captchaRef.current) {
        return;
      }

      let mounted = true;

      // 初始化极验4
      window.initGeetest4(
        {
          captchaId: captchaId,
          product: "popup",
          width: "100%",
        },
        (captcha: any) => {
          if (!mounted) {
            captcha.destroy();
            return;
          }

          captchaRef.current = captcha;

          // 监听验证成功事件
          captcha.onSuccess(() => {
            const result = captcha.getValidate();
            if (result) {
              onSuccess({
                lot_number: result.lot_number,
                pass_token: result.pass_token,
                gen_time: result.gen_time,
                captcha_output: result.captcha_output,
              });
            }
          });

          // 监听验证失败事件
          captcha.onError((err: any) => {
            onError(err?.msg || "验证初始化失败");
          });

          // 监听准备就绪事件
          captcha.onReady(() => {
            onReady?.();
          });

          // 绑定到容器
          captcha.appendTo(containerRef.current);
        }
      );

      return () => {
        mounted = false;
        if (captchaRef.current) {
          captchaRef.current.destroy();
          captchaRef.current = null;
        }
      };
    }, [captchaId]); // 只依赖 captchaId

    return (
      <div>
        <div ref={containerRef} />
      </div>
    );
  }
);

Geetest.displayName = "Geetest";
