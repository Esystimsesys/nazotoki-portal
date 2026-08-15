import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { Navigate, Route, Routes } from "react-router";
import { useTeamAuth } from "../features/team-auth/TeamAuthContext";
import { TeamLoginPage } from "../features/team-auth/TeamLoginPage";
import { AnswerPage } from "../features/answer/AnswerPage";
import { useAdminAuth } from "../features/admin-auth/AdminAuthContext";
import { AdminLoginPage } from "../features/admin-auth/AdminLoginPage";
import { AdminProblemsPage } from "../features/admin-problems/AdminProblemsPage";
import { AdminTeamsPage } from "../features/admin-teams/AdminTeamsPage";
import { AdminDashboardPage } from "../features/admin-dashboard/AdminDashboardPage";
import { AdminShell } from "../shared/layout/AdminShell";

function FullPageLoader() {
  return (
    <Box className="full-viewport" sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <CircularProgress />
    </Box>
  );
}

/** 未ログインの参加者は /login へ（team用ルーティングガード） */
function ProtectedTeamRoute({ children }: { children: ReactNode }) {
  const { status } = useTeamAuth();
  if (status === "loading") return <FullPageLoader />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** 未ログインの管理者は /admin/login へ（admin用ルーティングガード。参加者トークンとは完全に分離） */
function ProtectedAdminRoute({ children }: { children: ReactNode }) {
  const { status } = useAdminAuth();
  if (status === "loading") return <FullPageLoader />;
  if (status === "unauthenticated") return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function TeamLoginRoute() {
  const { status } = useTeamAuth();
  if (status === "loading") return <FullPageLoader />;
  if (status === "authenticated") return <Navigate to="/answer" replace />;
  return <TeamLoginPage />;
}

function AdminLoginRoute() {
  const { status } = useAdminAuth();
  if (status === "loading") return <FullPageLoader />;
  if (status === "authenticated") return <Navigate to="/admin/problems" replace />;
  return <AdminLoginPage />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 参加者 */}
      <Route path="/login" element={<TeamLoginRoute />} />
      <Route
        path="/answer"
        element={
          <ProtectedTeamRoute>
            <AnswerPage />
          </ProtectedTeamRoute>
        }
      />

      {/* 管理者 */}
      <Route path="/admin/login" element={<AdminLoginRoute />} />
      <Route
        element={
          <ProtectedAdminRoute>
            <AdminShell />
          </ProtectedAdminRoute>
        }
      >
        <Route path="/admin" element={<Navigate to="/admin/problems" replace />} />
        <Route path="/admin/problems" element={<AdminProblemsPage />} />
        <Route path="/admin/teams" element={<AdminTeamsPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
