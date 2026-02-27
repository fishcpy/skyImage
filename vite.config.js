var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import http from "node:http";
import https from "node:https";
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), "");
    var apiBase = env.VITE_API_BASE_URL || "";
    var fallbackTarget = apiBase || "http://localhost:8080";
    var shouldUseFallbackProxy = !apiBase;
    var imageExtRegex = /\.(png|jpe?g|gif|bmp|webp|svg|ico|avif)$/i;
    var skipPrefixes = ["/src/", "/@fs/", "/@id/", "/@vite", "/node_modules/"];
    return {
        plugins: [react()],
        resolve: {
            alias: {
                "@": path.resolve(__dirname, "./src")
            },
            extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]
        },
        server: {
            port: 5173,
            proxy: apiBase
                ? undefined
                : {
                    "/api": {
                        target: "http://localhost:8080",
                        changeOrigin: true
                    },
                    "/f": {
                        target: "http://localhost:8080",
                        changeOrigin: true
                    }
                }
        },
        configureServer: function (server) {
            if (!shouldUseFallbackProxy) {
                return;
            }
            server.middlewares.use(function (req, res, next) {
                var url = req.url || "/";
                var pathname = url.split("?")[0] || "/";
                if (skipPrefixes.some(function (prefix) { return pathname.startsWith(prefix); }) ||
                    !imageExtRegex.test(pathname)) {
                    return next();
                }
                var target = new URL(fallbackTarget);
                target.pathname = pathname;
                var queryIndex = url.indexOf("?");
                target.search = queryIndex >= 0 ? url.slice(queryIndex) : "";
                var proxy = (target.protocol === "https:" ? https : http).request(target, {
                    method: req.method,
                    headers: __assign(__assign({}, req.headers), { host: target.host })
                }, function (proxyRes) {
                    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
                    proxyRes.pipe(res);
                });
                proxy.on("error", function (error) {
                    console.error("Static proxy error:", error.message);
                    if (!res.headersSent) {
                        res.writeHead(502, { "Content-Type": "text/plain" });
                    }
                    res.end("Static proxy error");
                });
                req.pipe(proxy);
            });
        }
    };
});
