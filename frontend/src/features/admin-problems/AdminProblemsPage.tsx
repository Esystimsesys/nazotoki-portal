import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { problemsApi } from "../../api/problems";
import type { Problem, ProblemInput } from "../../api/types";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { downloadCsv, problemsToCsv, timestampedFilename } from "../../shared/csv";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { CsvImportModal } from "./CsvImportModal";
import { ProblemCard } from "./ProblemCard";
import { ProblemFormModal } from "./ProblemFormModal";

const QUERY_KEY = ["admin", "problems"];

export function AdminProblemsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => problemsApi.list(),
  });

  const [formTarget, setFormTarget] = useState<{ mode: "new" } | { mode: "edit"; problem: Problem } | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Problem | null>(null);
  // 一括開閉の指示。seqをインクリメントして各カードに伝える（同じ操作の連打も効くように）
  const [expandSignal, setExpandSignal] = useState({ open: false, seq: 0 });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: ProblemInput) => problemsApi.create(input),
    onSuccess: () => {
      invalidate();
      setFormTarget(null);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ problemId, input }: { problemId: string; input: ProblemInput }) =>
      problemsApi.update(problemId, input),
    onSuccess: () => {
      invalidate();
      setFormTarget(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (problemId: string) => problemsApi.remove(problemId),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });
  const setEnabledMutation = useMutation({
    mutationFn: ({ problemId, enabled }: { problemId: string; enabled: boolean }) =>
      problemsApi.setEnabled(problemId, enabled),
    onSuccess: invalidate,
  });
  const bulkMutation = useMutation({
    mutationFn: (enabled: boolean) => problemsApi.setBulkEnabled(enabled),
    onSuccess: invalidate,
  });
  const csvMutation = useMutation({
    mutationFn: (csv: string) => problemsApi.importCsv(csv),
    onSuccess: () => {
      invalidate();
      setCsvOpen(false);
    },
  });

  const problems = data?.problems ?? [];
  const formSubmitting = createMutation.isPending || updateMutation.isPending;
  const formError = formTarget?.mode === "edit" ? updateMutation.error : createMutation.error;

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{
          mb: 2.25,
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>問題一覧</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
            「有効」な問題だけが参加者の回答対象になります。有効な問題どうしで回答コードが重複しないよう登録時に自動チェックされます。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={bulkMutation.isPending}
            onClick={() => bulkMutation.mutate(true)}
          >
            ▶ 全て有効化
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={bulkMutation.isPending}
            onClick={() => bulkMutation.mutate(false)}
          >
            ■ 全て無効化
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={problems.length === 0}
            onClick={() => setExpandSignal((s) => ({ open: true, seq: s.seq + 1 }))}
          >
            ▽ 全て開く
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={problems.length === 0}
            onClick={() => setExpandSignal((s) => ({ open: false, seq: s.seq + 1 }))}
          >
            △ 全て閉じる
          </Button>
          <Button size="small" color="inherit" variant="outlined" onClick={() => setCsvOpen(true)}>
            ⬆ CSV取込
          </Button>
          <Button
            size="small"
            color="inherit"
            variant="outlined"
            disabled={problems.length === 0}
            onClick={() => downloadCsv(timestampedFilename("nazotoki-problems"), problemsToCsv(problems))}
          >
            ⬇ CSV出力
          </Button>
          <Button
            size="small"
            variant="contained"
            sx={{
              color: "#1a0f2e",
              background: "linear-gradient(135deg, #ffe08a, #f4c542)",
              "&:hover": { background: "linear-gradient(135deg, #ffe08a, #f4c542)" },
            }}
            onClick={() => setFormTarget({ mode: "new" })}
          >
            ＋ 新規問題
          </Button>
        </Stack>
      </Stack>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {isError && <ApiErrorAlert error={error} />}
      {bulkMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={bulkMutation.error} /></Box>}
      {deleteMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={deleteMutation.error} /></Box>}

      {!isLoading && !isError && problems.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
          まだ問題が登録されていません。「＋ 新規問題」から追加してください。
        </Typography>
      )}

      {problems.map((problem) => (
        <ProblemCard
          key={problem.problemId}
          problem={problem}
          expandSignal={expandSignal}
          onToggleEnabled={(enabled) => setEnabledMutation.mutate({ problemId: problem.problemId, enabled })}
          onEdit={() => setFormTarget({ mode: "edit", problem })}
          onDelete={() => setDeleteTarget(problem)}
        />
      ))}

      <ProblemFormModal
        open={formTarget !== null}
        problem={formTarget?.mode === "edit" ? formTarget.problem : null}
        // 編集中の問題自身のコードは対象外（そのままでも重複ではない）
        usedCodes={problems
          .filter((p) => p.problemId !== (formTarget?.mode === "edit" ? formTarget.problem.problemId : null))
          .flatMap((p) => p.patterns.map((pt) => pt.code))}
        submitting={formSubmitting}
        error={formError}
        onClose={() => setFormTarget(null)}
        onSubmit={(input) => {
          if (formTarget?.mode === "edit") {
            updateMutation.mutate({ problemId: formTarget.problem.problemId, input });
          } else {
            createMutation.mutate(input);
          }
        }}
      />

      <CsvImportModal
        open={csvOpen}
        submitting={csvMutation.isPending}
        error={csvMutation.error}
        onClose={() => setCsvOpen(false)}
        onSubmit={(csv) => csvMutation.mutate(csv)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="問題を削除しますか？"
        description={
          deleteTarget
            ? `「${deleteTarget.label}」を削除します。この操作は取り消せません（回答パターンも含めて物理削除されます）。`
            : undefined
        }
        confirmLabel="削除する"
        danger
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.problemId)}
      />
    </Box>
  );
}
