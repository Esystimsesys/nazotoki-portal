import { useEffect } from "react";
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
import type { Team, TeamInput } from "../../api/types";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";

/** メモの上限。バックエンドの NOTE_MAX_LENGTH と揃える */
const NOTE_MAX_LENGTH = 1000;

interface FormValues {
  teamName: string;
  note: string;
}

interface TeamFormModalProps {
  open: boolean;
  /** null なら新規登録、Team があればそのチームの編集 */
  team: Team | null;
  submitting: boolean;
  error: unknown;
  onSubmit: (input: TeamInput) => void;
  onClose: () => void;
}

/** チームの追加と編集を兼ねるモーダル。編集できるのはチーム名とメモだけ */
export function TeamFormModal({ open, team, submitting, error, onSubmit, onClose }: TeamFormModalProps) {
  const isEdit = team !== null;
  const { register, handleSubmit, reset, formState } = useForm<FormValues>({
    defaultValues: { teamName: "", note: "" },
  });

  // 編集対象が切り替わったときにフォームへ流し込む。モーダルは開閉しても
  // アンマウントされないため、defaultValues だけでは前のチームの値が残る。
  useEffect(() => {
    if (open) reset({ teamName: team?.teamName ?? "", note: team?.note ?? "" });
  }, [open, team, reset]);

  const handleClose = () => {
    reset({ teamName: "", note: "" });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}>
        {isEdit ? "チームを編集" : "チームを追加"}
        <IconButton onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box
        component="form"
        onSubmit={handleSubmit((values) => {
          onSubmit({ teamName: values.teamName.trim(), note: values.note.trim() });
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
          <TextField
            label="メモ（管理者のみ）"
            placeholder={"例: 山田 / 佐藤 / 鈴木\n受付で名札を渡し済み"}
            fullWidth
            multiline
            minRows={3}
            error={formState.errors.note !== undefined}
            helperText={
              formState.errors.note
                ? `${NOTE_MAX_LENGTH}文字以内で入力してください`
                : "メンバー名や申し送りなど。参加者の画面には表示されません。"
            }
            {...register("note", { maxLength: NOTE_MAX_LENGTH })}
          />
          {!isEdit && (
            <Typography variant="caption" color="text.secondary">
              ログインコードは登録時に自動生成されます（後から再発行も可能）。
            </Typography>
          )}
          {isEdit && (
            <Typography variant="caption" color="text.secondary">
              チーム名を変えるとランキングや集計の表示もすぐ切り替わります。ただし回答中の参加者の画面は、
              再ログインするまで変更前の名前のままです。
            </Typography>
          )}
          {error !== null && <ApiErrorAlert error={error} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={handleClose} color="inherit" disabled={submitting}>
            キャンセル
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? (isEdit ? "保存中…" : "追加中…") : isEdit ? "保存する" : "追加する"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
