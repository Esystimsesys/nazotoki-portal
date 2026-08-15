import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ApiError } from "../../api/client";

/**
 * API呼び出し失敗時の共通表示。
 * conflicts（問題コード重複）/ rowErrors（CSV行エラー）があれば一覧化する。
 * バックエンド未起動などで致命的に落ちないよう、画面はこのAlertを出すだけに留める。
 */
export function ApiErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : "予期しないエラーが発生しました。";
  const conflicts = error instanceof ApiError ? error.body?.conflicts : undefined;
  const rowErrors = error instanceof ApiError ? error.body?.rowErrors : undefined;

  return (
    <Alert severity="error" variant="outlined" sx={{ borderRadius: 2 }}>
      <Typography variant="body2">{message}</Typography>
      {conflicts && conflicts.length > 0 && (
        <Box component="ul" sx={{ m: "6px 0 0", pl: 2 }}>
          {conflicts.map((c) => (
            <Typography key={c} component="li" variant="caption" sx={{ display: "block" }}>
              重複コード: {c}
            </Typography>
          ))}
        </Box>
      )}
      {rowErrors && rowErrors.length > 0 && (
        <Box component="ul" sx={{ m: "6px 0 0", pl: 2 }}>
          {rowErrors.map((r, i) => (
            <Typography key={`${r.row}-${i}`} component="li" variant="caption" sx={{ display: "block" }}>
              {r.row}行目: {r.message}
            </Typography>
          ))}
        </Box>
      )}
    </Alert>
  );
}
