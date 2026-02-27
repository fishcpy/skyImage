import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
export function Turnstile({ siteKey, onVerify, onError, onExpire }) {
    const containerRef = useRef(null);
    const widgetIdRef = useRef(null);
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
    useEffect(() => {
        if (!containerRef.current || !window.turnstile)
            return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => {
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
        return () => {
            if (widgetIdRef.current && window.turnstile) {
                window.turnstile.remove(widgetIdRef.current);
                widgetIdRef.current = null;
            }
        };
    }, [siteKey]);
    return _jsx("div", { ref: containerRef });
}
