"use client";
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "./use-toast";
const ToastProvider = ({ children }) => _jsx(_Fragment, { children: children });
const ToastViewport = React.forwardRef(({ className, ...props }, ref) => (_jsx("div", { ref: ref, className: cn("pointer-events-none fixed top-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col", className), ...props })));
ToastViewport.displayName = "ToastViewport";
const Toast = React.forwardRef(({ className, ...props }, ref) => (_jsx("div", { ref: ref, className: cn("group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border bg-background p-4 pr-6 shadow-lg transition-all", className), ...props })));
Toast.displayName = "Toast";
const ToastClose = React.forwardRef(({ className, ...props }, ref) => (_jsx("button", { ref: ref, className: cn("absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100", className), ...props, children: _jsx(X, { className: "h-4 w-4" }) })));
ToastClose.displayName = "ToastClose";
const ToastTitle = React.forwardRef(({ className, ...props }, ref) => (_jsx("h3", { ref: ref, className: cn("text-sm font-semibold", className), ...props })));
ToastTitle.displayName = "ToastTitle";
const ToastDescription = React.forwardRef(({ className, ...props }, ref) => (_jsx("p", { ref: ref, className: cn("text-sm opacity-90", className), ...props })));
ToastDescription.displayName = "ToastDescription";
const ToastAction = ({ className, ...props }) => (_jsx("button", { className: cn("rounded-md border px-3 py-1 text-sm font-medium hover:bg-accent", className), ...props }));
function Toaster() {
    const { toasts, dismiss } = useToast();
    return (_jsx(ToastProvider, { children: _jsx(ToastViewport, { children: toasts.map(({ id, title, description, action }) => (_jsxs(Toast, { children: [_jsxs("div", { className: "grid gap-1", children: [title && _jsx(ToastTitle, { children: title }), description && _jsx(ToastDescription, { children: description })] }), action, _jsx(ToastClose, { onClick: () => dismiss(id) })] }, id))) }) }));
}
export { Toast, ToastAction, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, Toaster };
