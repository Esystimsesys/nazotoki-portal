import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { teamsApi } from "../../api/teams";
import type { Team, TeamInput } from "../../api/types";
import { ApiErrorAlert } from "../../shared/components/ApiErrorAlert";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { NeonPanel } from "../../shared/components/NeonPanel";
import { formatDate } from "../../shared/format";
import { TeamFormModal } from "./TeamFormModal";

const QUERY_KEY = ["admin", "teams"];

export function AdminTeamsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: QUERY_KEY, queryFn: () => teamsApi.list() });

  const [newTeamOpen, setNewTeamOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  // 完全削除は論理削除とは別の確認ダイアログにする。取り違えると復元できないため。
  const [purgeTarget, setPurgeTarget] = useState<Team | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (input: TeamInput) => teamsApi.create(input),
    onSuccess: () => {
      invalidate();
      setNewTeamOpen(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ teamId, input }: { teamId: string; input: TeamInput }) =>
      teamsApi.update(teamId, input),
    onSuccess: () => {
      invalidate();
      // チーム名はランキング・分析画面でも表示しているため、それらのキャッシュも捨てる
      queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "analysis"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "timeline"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "team-submissions"] });
      setEditTarget(null);
    },
  });
  const purgeMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.purge(teamId),
    onSuccess: () => {
      invalidate();
      // 順位・総回答数も変わるのでダッシュボード側のキャッシュも捨てる
      queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
      setPurgeTarget(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.remove(teamId),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
  });
  const regenerateMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.regenerateCode(teamId),
    onSuccess: invalidate,
  });

  const teams = data?.teams ?? [];

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
          <Typography sx={{ fontSize: 16, fontWeight: 800 }}>チーム一覧</Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
            共有ログインコードを配布して参加者にログインしてもらいます。
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          sx={{
            color: "#1a0f2e",
            background: "linear-gradient(135deg, #ffe08a, #f4c542)",
            "&:hover": { background: "linear-gradient(135deg, #ffe08a, #f4c542)" },
          }}
          onClick={() => setNewTeamOpen(true)}
        >
          ＋ チームを追加
        </Button>
      </Stack>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {isError && <ApiErrorAlert error={error} />}
      {updateMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={updateMutation.error} /></Box>}
      {removeMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={removeMutation.error} /></Box>}
      {purgeMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={purgeMutation.error} /></Box>}
      {regenerateMutation.isError && <Box sx={{ mb: 2 }}><ApiErrorAlert error={regenerateMutation.error} /></Box>}

      {!isLoading && !isError && (
        <TableContainer component={NeonPanel} sx={{ p: 0 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  チーム名
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  ログインコード
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  メモ
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  作成日
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  状態
                </TableCell>
                <TableCell sx={{ color: "text.secondary", fontSize: 11.5, bgcolor: "rgba(0,0,0,0.2)" }}>
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography color="text.secondary" sx={{ textAlign: "center", py: 3 }} component="div">
                      まだチームが登録されていません。
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {teams.map((team) => (
                <TableRow key={team.teamId} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{team.teamName}</TableCell>
                  <TableCell>
                    <Chip
                      className="mono"
                      size="small"
                      label={team.loginCode}
                      sx={{ bgcolor: "rgba(168,85,247,0.15)", color: "#d9c6ff", fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    {team.note ? (
                      // 改行入りのメモ（メンバーを1行ずつ書くなど）をそのまま読めるようにする
                      <Typography
                        sx={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                        component="div"
                      >
                        {team.note}
                      </Typography>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: "text.secondary" }} component="div">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(team.createdAt)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={team.active ? "有効" : "無効"}
                      sx={{
                        fontWeight: 700,
                        fontSize: 11,
                        bgcolor: team.active ? "rgba(57,255,136,0.15)" : "rgba(182,169,217,0.12)",
                        color: team.active ? "success.main" : "text.secondary",
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        color="inherit"
                        variant="outlined"
                        onClick={() => setEditTarget(team)}
                      >
                        編集
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        variant="outlined"
                        disabled={regenerateMutation.isPending}
                        onClick={() => regenerateMutation.mutate(team.teamId)}
                      >
                        コード再発行
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        variant="outlined"
                        disabled={!team.active}
                        onClick={() => setDeleteTarget(team)}
                      >
                        無効化
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => setPurgeTarget(team)}
                      >
                        完全削除
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TeamFormModal
        open={newTeamOpen}
        team={null}
        submitting={createMutation.isPending}
        error={createMutation.error}
        onClose={() => setNewTeamOpen(false)}
        onSubmit={(input) => createMutation.mutate(input)}
      />

      <TeamFormModal
        open={editTarget !== null}
        team={editTarget}
        submitting={updateMutation.isPending}
        error={updateMutation.error}
        onClose={() => setEditTarget(null)}
        onSubmit={(input) => editTarget && updateMutation.mutate({ teamId: editTarget.teamId, input })}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="チームを無効化しますか？"
        description={
          deleteTarget
            ? `チーム「${deleteTarget.teamName}」を無効化します。\n\nこのチームではログインできなくなりますが、回答記録と順位は残ります。\n順位からも消したい場合は「完全削除」を使ってください。`
            : undefined
        }
        confirmLabel="無効化する"
        danger
        loading={removeMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && removeMutation.mutate(deleteTarget.teamId)}
      />

      <ConfirmDialog
        open={purgeTarget !== null}
        title="チームを完全に削除しますか？"
        description={
          purgeTarget
            ? `チーム「${purgeTarget.teamName}」と、そのチームの回答記録をすべて削除します。\n\nランキングからも消え、元に戻すことはできません。\n他のチームのデータと問題には影響しません。`
            : undefined
        }
        confirmLabel="完全に削除する"
        danger
        loading={purgeMutation.isPending}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={() => purgeTarget && purgeMutation.mutate(purgeTarget.teamId)}
      />
    </Box>
  );
}
