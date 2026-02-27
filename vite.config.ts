import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import http from "node:http";
import https from "node:https";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL || "";

  const fallbackTarget = apiBase || "http://localhost:8080";
  const shouldUseFallbackProxy = !apiBase;
  const imageExtRegex = /\.(png|jpe?g|gif|bmp|webp|svg|ico|avif)$/i;
  const skipPrefixes = ["/src/", "/@fs/", "/@id/", "/@vite", "/node_modules/"];

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
    configureServer(server) {
      if (!shouldUseFallbackProxy) {
        return;
      }
      server.middlewares.use((req, res, next) => {
        const url = req.url || "/";
        const pathname = url.split("?")[0] || "/";
        if (
          skipPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
          !imageExtRegex.test(pathname)
        ) {
          return next();
        }
        const target = new URL(fallbackTarget);
        target.pathname = pathname;
        const queryIndex = url.indexOf("?");
        target.search = queryIndex >= 0 ? url.slice(queryIndex) : "";
        const proxy = (target.protocol === "https:" ? https : http).request(
          target,
          {
            method: req.method,
            headers: {
              ...req.headers,
              host: target.host
            }
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxy.on("error", (error) => {
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
