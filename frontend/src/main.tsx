import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { queryClient } from "./app/queryClient";
import { AppRouter } from "./app/router";
import { theme } from "./app/theme";
import { AdminAuthProvider } from "./features/admin-auth/AdminAuthContext";
import { TeamAuthProvider } from "./features/team-auth/TeamAuthContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <TeamAuthProvider>
          <AdminAuthProvider>
            <BrowserRouter>
              <AppRouter />
            </BrowserRouter>
          </AdminAuthProvider>
        </TeamAuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
