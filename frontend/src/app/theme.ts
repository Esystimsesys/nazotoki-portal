import { createTheme } from "@mui/material/styles";
import { jaJP } from "@mui/material/locale";

// デザイントークン（mockups/*.html の :root から抽出。謎解きイベント向けダーク×ネオンテーマ）
export const neon = {
  bgDeep: "#0b0716",
  bgPanel: "#16102a",
  bgPanel2: "#1e1638",
  purple: "#8b5cf6",
  purpleGlow: "#a855f7",
  magenta: "#ff2e9a",
  gold: "#f4c542",
  goldSoft: "#ffe08a",
  success: "#39ff88",
  danger: "#ff4b6e",
  ink: "#f3ecff",
  inkDim: "#b6a9d9",
  borderGlow: "rgba(168, 85, 247, 0.35)",
};

// モックの背景（2つのradial-gradient重ね合わせ + ベース色）
export const neonBackgroundGradient = `radial-gradient(circle at 20% -10%, #2a1a4d 0%, ${neon.bgDeep} 55%), radial-gradient(circle at 90% 110%, #3a0f45 0%, ${neon.bgDeep} 60%), ${neon.bgDeep}`;

// パネル/カード共通の背景（linear-gradient(160deg, panel2, panel)）
export const neonPanelGradient = `linear-gradient(160deg, ${neon.bgPanel2}, ${neon.bgPanel})`;

export const theme = createTheme(
  {
    palette: {
      mode: "dark",
      background: {
        default: neon.bgDeep,
        paper: neon.bgPanel,
      },
      text: {
        primary: neon.ink,
        secondary: neon.inkDim,
      },
      primary: {
        main: neon.purpleGlow,
        dark: neon.purple,
        contrastText: "#1a0f2e",
      },
      secondary: {
        main: neon.magenta,
        contrastText: "#ffffff",
      },
      warning: {
        main: neon.gold,
        light: neon.goldSoft,
        contrastText: "#1a0f2e",
      },
      success: {
        main: neon.success,
        contrastText: "#08210f",
      },
      error: {
        main: neon.danger,
      },
      divider: neon.borderGlow,
    },
    shape: {
      borderRadius: 14,
    },
    typography: {
      fontFamily: [
        '"Noto Sans JP"',
        "-apple-system",
        "BlinkMacSystemFont",
        '"Hiragino Kaku Gothic ProN"',
        '"Yu Gothic"',
        "sans-serif",
      ].join(","),
      button: { textTransform: "none", fontWeight: 700 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: neonBackgroundGradient,
            backgroundAttachment: "fixed",
            minHeight: "100vh",
          },
          "input, select, textarea": {
            fontSize: 16,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            touchAction: "manipulation",
            fontWeight: 700,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiTextField: {
        defaultProps: {
          slotProps: {
            htmlInput: { style: { fontSize: 16 } },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: "rgba(255,255,255,0.06)",
          },
        },
      },
    },
  },
  jaJP,
);
