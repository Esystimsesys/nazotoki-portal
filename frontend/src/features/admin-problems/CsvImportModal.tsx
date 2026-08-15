import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";

interface CsvImportModalProps {
  open: boolean;
  submitting: boolean;
  error: unknown;
  onSubmit: (csv: string) => void;
  onClose: () => void;
}

/** CSV一括取込モーダル（mockups/admin-mock.html #modal-csv 相当） */
export function CsvImportModal({ open, submitting, error, onSubmit, onClose }: CsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
  };

  const handleClose = () => {
    setFileName("");
    setCsvText("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontWeight: 800 }}>
        CSVで問題を一括取込
        <IconButton onClick={handleClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          問題・回答パターンをまとめて登録できます。1行=1回答パターンで、同じ問題名の行はまとめられます。
        </Typography>

        <Box sx={{ background: "#0d0819", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "10px", p: "12px 14px" }}>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.75 }}>CSVフォーマット</Typography>
          <Typography component="code" sx={{ fontFamily: "monospace", fontSize: 12, color: "#cdb8ff" }}>
            問題名,コード,判定(正解/不正解),賞金,メモ
          </Typography>
          <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, color: "text.secondary", mt: 1, lineHeight: 1.7 }}>
            問題4「星読みの間」,7788,正解,1000,
            <br />
            問題4「星読みの間」,8877,不正解,-200,ひっかけ
            <br />
            問題5「風の回廊」,,正解,500,←コード空欄で自動採番
          </Typography>
        </Box>

        <Typography sx={{ fontSize: 11.5, color: "text.secondary", lineHeight: 1.7 }}>
          コード列を<b>空欄</b>または <code>auto</code> にすると、未使用の4桁を自動で割り当てます。
          割り当てられたコードは取込後の一覧で確認できます。
        </Typography>

        <Box
          onClick={() => fileInputRef.current?.click()}
          sx={{
            textAlign: "center",
            p: 3,
            border: "1.5px dashed rgba(168,85,247,0.4)",
            borderRadius: "12px",
            cursor: "pointer",
            "&:hover": { borderColor: "#a855f7", background: "rgba(168,85,247,0.05)" },
          }}
        >
          <Typography sx={{ fontSize: 28 }}>📄</Typography>
          <Typography sx={{ fontSize: 13, mt: 0.75 }}>クリックして CSV ファイルを選択</Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>
            または、ここにドラッグ＆ドロップ
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {fileName && (
            <Typography sx={{ fontSize: 12, color: "#ffe08a", mt: 1 }}>選択中: {fileName}</Typography>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            gap: 1,
            p: "10px 12px",
            background: "rgba(244,197,66,0.08)",
            border: "1px solid rgba(244,197,66,0.25)",
            borderRadius: "10px",
            fontSize: 11.5,
            color: "#ffe08a",
            lineHeight: 1.6,
          }}
        >
          💡 取込時にも、有効な問題どうしでの4桁コード重複チェックが行われます。重複行はエラーとして一覧表示され、修正するまで取込は確定しません。
        </Box>

        {error !== null && <ApiErrorAlert error={error} />}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} color="inherit" disabled={submitting}>
          キャンセル
        </Button>
        <Button
          variant="contained"
          disabled={submitting || !csvText}
          onClick={() => onSubmit(csvText)}
        >
          {submitting ? "取込中…" : "取込を確定"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
