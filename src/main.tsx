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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <Toaster 
          position="top-center" 
          duration={3000}
          closeButton
          richColors
          expand={true}
          visibleToasts={3}
          toastOptions={{
            className: 'toast-custom',
            style: {
              minWidth: '280px',
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
