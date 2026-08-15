import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { useForm } from "react-hook-form";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";

interface FormValues {
  teamName: string;
}

interface NewTeamModalProps {
  open: boolean;
  submitting: boolean;
  error: unknown;
  onSubmit: (teamName: string) => void;
  onClose: () => void;
}

export function NewTeamModal({ open, submitting, error, onSubmit, onClose }: NewTeamModalProps) {
  const { register, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { teamName: "" } });

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}>
        チームを追加
        <IconButton onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box
        component="form"
        onSubmit={handleSubmit((values) => {
          onSubmit(values.teamName.trim());
          reset();
        })}
      >
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="チーム名"
            placeholder="例: 星屑ラビリンス"
            fullWidth
            autoFocus
            {...register("teamName", { required: true })}
          />
          <Typography variant="caption" color="text.secondary">
            ログインコードは登録時に自動生成されます（後から再発行も可能）。
          </Typography>
          {error !== null && <ApiErrorAlert error={error} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleClose} color="inherit" disabled={submitting}>
            キャンセル
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? "追加中…" : "追加する"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
