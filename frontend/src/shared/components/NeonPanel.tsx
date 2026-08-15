import Paper, { type PaperProps } from "@mui/material/Paper";
import { styled } from "@mui/material/styles";
import { neon, neonPanelGradient } from "../../app/theme";

/** モックの `.card` / `.login-card` / `.modal` 相当（ダーク×ネオンのグラデーションパネル） */
export const NeonPanel = styled(Paper)<PaperProps>(() => ({
  background: neonPanelGradient,
  border: `1px solid ${neon.borderGlow}`,
  borderRadius: 16,
  padding: "18px 20px",
}));
