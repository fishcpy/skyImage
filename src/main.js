import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";
import { useAuthStore } from "./state/auth";
import { ThemeProvider } from "./components/ThemeProvider";
const queryClient = new QueryClient();
useAuthStore.getState().hydrate();
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(QueryClientProvider, { client: queryClient, children: _jsxs(ThemeProvider, { children: [_jsx(BrowserRouter, { children: _jsx(App, {}) }), _jsx(Toaster, { position: "top-center", duration: 3000, closeButton: true, richColors: true, expand: true, visibleToasts: 3, toastOptions: {
                        className: 'toast-custom',
                        style: {
                            minWidth: '280px',
                        },
                    } })] }) }) }));
