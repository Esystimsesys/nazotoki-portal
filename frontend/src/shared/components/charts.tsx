import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

/**
 * グラフ用パレット。
 * dataviz スキルの validate_palette.js でダーク面(#16102a)に対して検証済み。
 * 明度帯 L0.48–0.67 / 彩度下限 / CVD分離 ΔE 9.3(deutan) / 通常視 ΔE 20.7 / コントラスト比 いずれもPASS。
 * 賞金は正にも負にもなるため、獲得＝ゴールド／減点＝レッドの2極（発散）で表す。
 */
export const CHART_COLORS = {
  gain: "#b58a18",
  loss: "#d6395a",
  /** 未回答など「値なし」を表す控えめな面 */
  empty: "rgba(255,255,255,0.10)",
} as const;

export function formatYen(n: number): string {
  return (n < 0 ? "-¥" : "¥") + Math.abs(n).toLocaleString();
}

/** 億円単位に丸めた短い表記（軸ラベル用。桁が大きいので実額だと読めないため） */
export function formatOku(n: number): string {
  const oku = n / 100_000_000;
  const s = Number.isInteger(oku) ? String(oku) : oku.toFixed(1);
  return `${s}億`;
}

interface BarRow {
  key: string;
  label: string;
  value: number;
  /** 強調表示（自チームなど） */
  highlight?: boolean;
}

/**
 * 横棒グラフ。単一系列のため凡例は持たず、値を各バーに直接ラベルする。
 * 正負が混在しうるのでゼロ基準線を中央に置かず、
 * 「負の最大幅」ぶん左に余白を確保して0の位置を揃える。
 */
export function BarChart({ rows, maxBars }: { rows: BarRow[]; maxBars?: number }) {
  const shown = maxBars ? rows.slice(0, maxBars) : rows;
  if (shown.length === 0) {
    return (
      <Typography sx={{ fontSize: 12, color: "text.secondary", py: 2, textAlign: "center" }}>
        表示できるデータがありません。
      </Typography>
    );
  }
  const maxPos = Math.max(0, ...shown.map((r) => r.value));
  const maxNeg = Math.min(0, ...shown.map((r) => r.value));
  const span = Math.max(maxPos - maxNeg, 1);
  const zeroPct = (-maxNeg / span) * 100;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {shown.map((r) => {
        const widthPct = (Math.abs(r.value) / span) * 100;
        const leftPct = r.value >= 0 ? zeroPct : zeroPct - widthPct;
        return (
          <Box key={r.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography
              sx={{
                width: { xs: 96, sm: 132 },
                flex: "0 0 auto",
                fontSize: 12,
                fontWeight: r.highlight ? 800 : 500,
                color: r.highlight ? "text.primary" : "text.secondary",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={r.label}
            >
              {r.label}
            </Typography>
            <Tooltip title={`${r.label}: ${formatYen(r.value)}`} placement="top" arrow>
              <Box sx={{ position: "relative", flex: 1, height: 22, minWidth: 0 }}>
                {/* ゼロ基準線 */}
                <Box
                  sx={{
                    position: "absolute",
                    left: `${zeroPct}%`,
                    top: -2,
                    bottom: -2,
                    width: "1px",
                    background: "rgba(255,255,255,0.18)",
                  }}
                />
                <Box
                  sx={{
                    position: "absolute",
                    top: 3,
                    height: 16,
                    left: `${leftPct}%`,
                    width: `${Math.max(widthPct, r.value === 0 ? 0 : 0.6)}%`,
                    background: r.value >= 0 ? CHART_COLORS.gain : CHART_COLORS.loss,
                    // データ端(0から遠い側)だけ角丸にして、基準線側は角のままにする
                    borderRadius: r.value >= 0 ? "0 4px 4px 0" : "4px 0 0 4px",
                  }}
                />
              </Box>
            </Tooltip>
            <Typography
              sx={{
                width: { xs: 62, sm: 78 },
                flex: "0 0 auto",
                textAlign: "right",
                fontSize: 11.5,
                fontWeight: 700,
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatOku(r.value)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

export interface ProblemCellState {
  key: string;
  label: string;
  /** solved=正解済み / penalty=マイナスパターンを踏んだ / none=未回答 */
  state: "solved" | "penalty" | "none";
  tooltip: string;
}

/**
 * 問題ごとの到達状況をマス目で一覧するヒートマップ風の表示。
 * 状態色は必ずラベル（凡例）と併記し、色だけで意味を伝えない。
 */
export function ProblemGrid({ cells }: { cells: ProblemCellState[] }) {
  const fill = (s: ProblemCellState["state"]) =>
    s === "solved" ? CHART_COLORS.gain : s === "penalty" ? CHART_COLORS.loss : CHART_COLORS.empty;

  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))",
          gap: "4px",
        }}
      >
        {cells.map((c) => (
          <Tooltip key={c.key} title={c.tooltip} placement="top" arrow>
            <Box
              sx={{
                aspectRatio: "1 / 1",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: c.state === "none" ? "text.secondary" : "#120d20",
                background: fill(c.state),
                border: c.state === "none" ? "1px solid rgba(255,255,255,0.12)" : "none",
                cursor: "default",
              }}
            >
              {c.label}
            </Box>
          </Tooltip>
        ))}
      </Box>
      <Legend
        items={[
          { color: CHART_COLORS.gain, label: "正解済み" },
          { color: CHART_COLORS.loss, label: "マイナスを踏んだ" },
          { color: CHART_COLORS.empty, label: "未回答", outlined: true },
        ]}
      />
    </Box>
  );
}

export function Legend({
  items,
}: {
  items: { color: string; label: string; outlined?: boolean }[];
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
      {items.map((i) => (
        <Box key={i.label} sx={{ display: "flex", alignItems: "center", gap: 0.625 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "3px",
              background: i.color,
              border: i.outlined ? "1px solid rgba(255,255,255,0.2)" : "none",
              flex: "0 0 auto",
            }}
          />
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{i.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}
