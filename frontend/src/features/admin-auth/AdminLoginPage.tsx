import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { NeonPanel } from "../../shared/components/NeonPanel";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { useAdminAuth } from "./AdminAuthContext";

interface FormValues {
  username: string;
  password: string;
}

export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<FormValues>({ defaultValues: { username: "", password: "" } });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await login(values.username.trim(), values.password);
      navigate("/admin/problems", { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      className="starfield full-viewport"
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 3,
        textAlign: "center",
        position: "relative",
      }}
    >
      <Box sx={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
        <Typography sx={{ fontSize: 36, mb: 1 }}>🔮</Typography>
        <Typography
          className="brand-font"
          sx={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: 2,
            background: "linear-gradient(135deg, #ffe08a, #f4c542 40%, #ff2e9a 90%)",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            color: "transparent",
            mb: 0.5,
          }}
        >
          管理コンソール ログイン
        </Typography>
        <Typography sx={{ color: "text.secondary", fontSize: 12, mb: 4 }}>謎解きナイト運営専用</Typography>

        <NeonPanel component="form" onSubmit={handleSubmit(onSubmit)} sx={{ p: "32px 24px", textAlign: "left" }}>
          <TextField
            label="ユーザー名"
            fullWidth
            autoComplete="username"
            sx={{ mb: 2 }}
            {...register("username", { required: true })}
          />
          <TextField
            label="パスワード"
            type="password"
            fullWidth
            autoComplete="current-password"
            sx={{ mb: 2.5 }}
            {...register("password", { required: true })}
          />
          <Button
            type="submit"
            fullWidth
            disabled={submitting}
            sx={{
              py: 1.6,
              fontSize: 15,
              color: "#1a0f2e",
              background: "linear-gradient(135deg, #ffe08a, #f4c542)",
              boxShadow: "0 6px 20px rgba(244,197,66,0.35)",
              "&:hover": { background: "linear-gradient(135deg, #ffe08a, #f4c542)" },
            }}
          >
            {submitting ? "確認中…" : "ログイン"}
          </Button>
          {error !== null && (
            <Box sx={{ mt: 2 }}>
              <ApiErrorAlert error={error} />
            </Box>
          )}
        </NeonPanel>
      </Box>
    </Box>
  );
}
