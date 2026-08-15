import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 削除など取り消しにくい操作の確認ダイアログ（管理画面の各所から共通利用） */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
      {description && (
        <DialogContent>
          <DialogContentText sx={{ whiteSpace: "pre-line" }}>{description}</DialogContentText>
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel} color="inherit" disabled={loading}>
          {cancelLabel}
        </Button>
        <Button onClick={onConfirm} color={danger ? "error" : "primary"} variant="contained" disabled={loading}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
