import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useAdminAuth } from "../../features/admin-auth/AdminAuthContext";
import { neon } from "../../app/theme";
import { EventControl } from "./EventControl";

const TABS = [
  { path: "/admin/problems", label: "📖 問題管理" },
  { path: "/admin/teams", label: "🚩 チーム管理" },
  { path: "/admin/dashboard", label: "🏆 ダッシュボード" },
  { path: "/admin/screen", label: "🖥 大画面表示" },
];

/** 管理コンソール共通レイアウト（ヘッダー＋タブ） */
export function AdminShell() {
  const { admin, logout } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = TABS.find((t) => location.pathname.startsWith(t.path))?.path ?? TABS[0].path;

  return (
    <Box className="starfield full-viewport" sx={{ position: "relative" }}>
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: { xs: 2, sm: 3.5 },
          py: 1.5,
          borderBottom: `1px solid ${neon.borderGlow}`,
          background: "rgba(15,10,28,0.7)",
          backdropFilter: "blur(6px)",
        }}
      >
        <Typography
          className="brand-font"
          sx={{
            fontSize: { xs: 16, sm: 20 },
            fontWeight: 900,
            background: `linear-gradient(135deg, ${neon.goldSoft}, ${neon.gold} 40%, ${neon.magenta} 90%)`,
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
          }}
        >
          🔮 謎解きナイト{" "}
          <Typography component="span" sx={{ fontSize: 12, color: "text.secondary", fontWeight: 500 }}>
            管理コンソール
          </Typography>
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <EventControl />
          <Typography variant="body2" sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }}>
            {admin?.username}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            color="inherit"
            onClick={() => {
              logout();
              navigate("/admin/login", { replace: true });
            }}
          >
            ログアウト
          </Button>
        </Box>
      </Box>

      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 1, sm: 3.5 }, pt: 1.5 }}>
        <Tabs
          value={activeTab}
          onChange={(_, value: string) => navigate(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          slotProps={{ indicator: { style: { display: "none" } } }}
          sx={{ minHeight: 0 }}
        >
          {TABS.map((t) => (
            <Tab
              key={t.path}
              value={t.path}
              label={t.label}
              sx={{
                minHeight: 0,
                py: 1.2,
                fontWeight: 700,
                borderRadius: "10px 10px 0 0",
                "&.Mui-selected": {
                  color: neon.goldSoft,
                  background: "rgba(30,22,56,0.6)",
                },
              }}
            />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3.5 }, py: 3, position: "relative", zIndex: 1 }}>
        <Outlet />
      </Box>
    </Box>
  );
}
