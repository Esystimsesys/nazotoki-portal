import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eventApi } from "../../api/event";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ApiErrorAlert } from "../components/ApiErrorAlert";
import { formatTime } from "../format";
import { neon } from "../../app/theme";

export const EVENT_QUERY_KEY = ["admin", "event"];

/**
 * イベント全体の開始/終了スイッチ。
 * 問題ごとの有効/無効とは別の軸で、running が false の間は有効な問題があっても回答を受け付けない。
 * これにより「全問題を有効にしたまま開始時刻を待つ」「途中から特定の問題だけ追加投入する」を
 * 両立できる（開始/終了のたびに全問題のenabledを設定し直さなくてよい）。
 *
 * 管理コンソールのヘッダーに常設する。どのタブを開いていても状態が見えて操作できることが
 * 運用上いちばん重要なため（開始/終了は時間に追われる場面で押すもの）。
 */
export function EventControl() {
  const queryClient = useQueryClient();
  const [confirmTarget, setConfirmTarget] = useState<boolean | null>(null);
  // 閉じるアニメーションの間もダイアログは描画され続けるため、confirmTarget を
  // そのまま文言に使うと null に戻した瞬間に「開始しますか？」→「終了しますか？」と
  // 反転して見える。直前の指示を別に覚えておき、文言はそちらから引く。
  const [lastConfirmTarget, setLastConfirmTarget] = useState(false);

  const openConfirm = (running: boolean) => {
    mutation.reset();
    setLastConfirmTarget(running);
    setConfirmTarget(running);
  };

  const { data, isError, error } = useQuery({
    queryKey: EVENT_QUERY_KEY,
    queryFn: () => eventApi.get("admin"),
    // 管理者が複数人いる場合に、別の人が開始/終了した結果が手元にも反映されるようにする
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const mutation = useMutation({
    mutationFn: (running: boolean) => eventApi.setRunning(running),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: EVENT_QUERY_KEY });
      // 大画面表示・ダッシュボードは summary 側に載る event を見ているので合わせて更新する
      queryClient.invalidateQueries({ queryKey: ["admin", "summary"] });
      setConfirmTarget(null);
    },
  });

  // 初期取得前や取得失敗時に running=false と解釈すると、実際の状態を知らないまま
  // 開始・再開操作を許してしまう。状態が確定したときだけ操作可能にする。
  const stateKnown = data !== undefined && !isError;
  const state = stateKnown ? data.event : undefined;
  const running = state?.running ?? false;
  // 未開始と終了後は同じ running=false だが、運用上まったく違う状態なので区別して出す
  const finished = !running && state?.endedAt != null;

  const statusLabel = !stateKnown ? "状態不明" : running ? "開催中" : finished ? "終了" : "開始前";
  const statusColor = !stateKnown ? neon.inkDim : running ? neon.success : finished ? neon.inkDim : neon.gold;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 360 }}>
      {isError && <ApiErrorAlert error={error} />}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box
            sx={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: statusColor,
              boxShadow: running ? `0 0 8px ${statusColor}` : "none",
              flex: "0 0 auto",
            }}
          />
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: statusColor, lineHeight: 1.2 }}>
              {statusLabel}
            </Typography>
            {state?.startedAt && (
              <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.2 }}>
                {running
                  ? `${formatTime(state.startedAt)} 開始`
                  : state.endedAt
                    ? `${formatTime(state.endedAt)} 終了`
                    : null}
              </Typography>
            )}
          </Box>
        </Box>
        <Button
          size="small"
          variant={stateKnown && running ? "outlined" : "contained"}
          color={stateKnown && running ? "inherit" : "primary"}
          disabled={!stateKnown || mutation.isPending}
          onClick={() => openConfirm(!running)}
          sx={
            running
              ? undefined
              : {
                  color: "#1a0f2e",
                  background: "linear-gradient(135deg, #ffe08a, #f4c542)",
                  "&:hover": { background: "linear-gradient(135deg, #ffe08a, #f4c542)" },
                }
          }
        >
          {!stateKnown ? "状態不明" : running ? "■ 終了" : finished ? "▶ 再開" : "▶ 開始"}
        </Button>
      </Box>

      <ConfirmDialog
        open={confirmTarget !== null}
        title={lastConfirmTarget ? "イベントを開始しますか？" : "イベントを終了しますか？"}
        description={
          lastConfirmTarget
            ? "全チームの回答受付を開始します。有効になっている問題だけが回答対象になります（問題ごとの有効/無効はこの操作では変わりません）。"
            : "全チームの回答受付を停止します。問題ごとの有効/無効は変わらないので、再開すればそのまま続きから受け付けられます。"
        }
        confirmLabel={lastConfirmTarget ? "開始する" : "終了する"}
        danger={!lastConfirmTarget}
        loading={mutation.isPending}
        confirmDisabled={!stateKnown}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => stateKnown && confirmTarget !== null && mutation.mutate(confirmTarget)}
      >
        {isError && <Box sx={{ mt: 2 }}><ApiErrorAlert error={error} /></Box>}
        {mutation.isError && <Box sx={{ mt: 2 }}><ApiErrorAlert error={mutation.error} /></Box>}
      </ConfirmDialog>
    </Box>
  );
}
