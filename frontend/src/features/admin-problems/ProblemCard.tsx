import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { Problem } from "../../api/types";
import { formatPrize, prizeColor } from "../../shared/format";
import { NeonPanel } from "../../shared/components/NeonPanel";

interface ProblemCardProps {
  problem: Problem;
  /**
   * 一括開閉の指示。値が変わるたびにその状態へ揃える。
   * 個別のクリックでの開閉も引き続きできるよう、内部stateは保持したまま同期する。
   */
  expandSignal?: { open: boolean; seq: number };
  onToggleEnabled: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** 問題1件のカード。折りたたみで回答パターン一覧を表示する */
export function ProblemCard({ problem, expandSignal, onToggleEnabled, onEdit, onDelete }: ProblemCardProps) {
  const [open, setOpen] = useState(false);

  // seq が変わったときだけ一括開閉を反映する（open の値だけを見ると、
  // 個別に閉じたあとで同じ「全て開く」を押しても反応しなくなるため）
  const lastSeq = useRef(expandSignal?.seq ?? 0);
  useEffect(() => {
    if (expandSignal && expandSignal.seq !== lastSeq.current) {
      lastSeq.current = expandSignal.seq;
      setOpen(expandSignal.open);
    }
  }, [expandSignal]);

  return (
    <NeonPanel sx={{ mb: 1.75, opacity: problem.enabled ? 1 : 0.6 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap" }}>
        <Box
          onClick={() => setOpen((v) => !v)}
          sx={{ display: "flex", alignItems: "center", gap: 1.25, cursor: "pointer", fontWeight: 800, fontSize: 15 }}
        >
          <ExpandMoreIcon
            fontSize="small"
            sx={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "text.secondary" }}
          />
          <span>{problem.label}</span>
          <Chip
            size="small"
            label={problem.enabled ? "有効" : "無効"}
            sx={{
              fontWeight: 700,
              fontSize: 11,
              bgcolor: problem.enabled ? "rgba(57,255,136,0.15)" : "rgba(182,169,217,0.12)",
              color: problem.enabled ? "success.main" : "text.secondary",
            }}
          />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <IconButton size="small" onClick={onEdit} aria-label="編集">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} aria-label="削除">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>回答受付</Typography>
          <Switch
            checked={problem.enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
            color="success"
          />
        </Box>
      </Box>

      {open && (
        <Box sx={{ mt: 2, overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: "text.secondary", fontSize: 11 }}>コード</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11 }}>判定</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11 }}>賞金</TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11 }}>メモ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {problem.patterns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="caption" color="text.secondary">
                      回答パターンが登録されていません。
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {problem.patterns.map((p) => (
                <TableRow key={p.patternId}>
                  <TableCell className="mono" sx={{ color: "#cdb8ff", fontWeight: 700 }}>
                    {p.code}
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={p.isCorrect ? "正解" : "不正解"}
                      sx={{
                        fontWeight: 700,
                        fontSize: 11,
                        bgcolor: p.isCorrect ? "rgba(57,255,136,0.15)" : "rgba(255,75,110,0.15)",
                        color: p.isCorrect ? "success.main" : "error.main",
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: prizeColor(p.prize), fontWeight: 800 }}>{formatPrize(p.prize)}</TableCell>
                  <TableCell sx={{ color: "text.secondary" }}>{p.note || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </NeonPanel>
  );
}
