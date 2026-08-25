import { useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { formatYen, formatOku, seriesColor } from "./charts";

export interface TimelinePoint {
  at: string;
  total: number;
}

export interface TimelineSeries {
  teamId: string;
  teamName: string;
  total: number;
  points: TimelinePoint[];
}

const PAD = { top: 12, right: 16, bottom: 26, left: 62 };
const HEIGHT = 300;
/** 面の色（NeonPanel の背景）。線が重なる点に縁として敷いて可読性を保つ */
const SURFACE = "#16102a";

function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

/**
 * チームごとの賞金推移（時系列の折れ線）。
 *
 * **階段状（step-after）で描く。** 賞金は回答した瞬間に飛ぶ値で、その間はずっと
 * 横ばい。直線で結ぶと「じわじわ増えた」ように見えて実態と食い違うため、
 * 次の点の時刻まで水平に伸ばしてから垂直に上下させる。
 *
 * 賞金はマイナスにもなるので、0の基準線を必ず描く。
 */
export function TimelineChart({ series }: { series: TimelineSeries[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // 親の幅に追従する（レイアウト確定後に一度読む。ResizeObserverで追随）
  const setWrap = (el: HTMLDivElement | null) => {
    wrapRef.current = el;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
  };

  const model = useMemo(() => {
    const times = series.flatMap((s) => s.points.map((p) => new Date(p.at).getTime()));
    const values = series.flatMap((s) => s.points.map((p) => p.total));
    if (times.length === 0) return null;
    const t0 = Math.min(...times);
    const t1 = Math.max(...times);
    const vMin = Math.min(0, ...values);
    const vMax = Math.max(0, ...values);
    // 上下に少し余白を持たせて、線が枠に貼りつかないようにする
    const padV = (vMax - vMin) * 0.08 || 1;
    return { t0, t1: t1 === t0 ? t0 + 1 : t1, vMin: vMin - padV, vMax: vMax + padV };
  }, [series]);

  if (!model || series.length === 0) {
    return (
      <Typography sx={{ fontSize: 12, color: "text.secondary", py: 4, textAlign: "center" }}>
        まだ回答記録がありません。
      </Typography>
    );
  }

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - model.t0) / (model.t1 - model.t0)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - model.vMin) / (model.vMax - model.vMin)) * innerH;

  const yTicks = niceTicks(model.vMin, model.vMax);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => model.t0 + (model.t1 - model.t0) * f);
  const fmtTime = (t: number) =>
    new Date(t).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });

  // step-after のパス
  const pathOf = (s: TimelineSeries) => {
    const pts = s.points;
    let d = "";
    pts.forEach((p, i) => {
      const px = x(new Date(p.at).getTime());
      const py = y(p.total);
      if (i === 0) d += `M ${px} ${py}`;
      else d += ` H ${px} V ${py}`;
    });
    return d;
  };

  // ホバー位置の時刻に対する各系列の値（その時刻までの最後の点）
  const hoverT = hoverX === null ? null : model.t0 + ((hoverX - PAD.left) / innerW) * (model.t1 - model.t0);
  const hoverRows =
    hoverT === null
      ? []
      : series.map((s, i) => {
          let v = 0;
          for (const p of s.points) {
            if (new Date(p.at).getTime() <= hoverT) v = p.total;
            else break;
          }
          return { name: s.teamName, value: v, color: seriesColor(i) };
        });

  return (
    <Box ref={setWrap} sx={{ position: "relative", width: "100%" }}>
      <Box
        component="svg"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        sx={{ width: "100%", height: HEIGHT, display: "block", touchAction: "none" }}
        onMouseMove={(e: React.MouseEvent<SVGSVGElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * width;
          setHoverX(px >= PAD.left && px <= PAD.left + innerW ? px : null);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* Y軸の目盛り線。実線のヘアラインで控えめに */}
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + innerW}
              y1={y(v)}
              y2={y(v)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              fill="#b6a9d9"
              fontSize={10.5}
            >
              {formatOku(v)}
            </text>
          </g>
        ))}

        {/* ゼロ基準線。賞金は負にもなるので必ず描く */}
        <line
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={y(0)}
          y2={y(0)}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth={1}
        />

        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={HEIGHT - 8} textAnchor="middle" fill="#b6a9d9" fontSize={10.5}>
            {fmtTime(t)}
          </text>
        ))}

        {hoverX !== null && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth={1}
          />
        )}

        {series.map((s, i) => (
          <path
            key={s.teamId}
            d={pathOf(s)}
            fill="none"
            stroke={seriesColor(i)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* 終端のドット。面の色で縁取りして、線が重なっても見分けられるようにする */}
        {series.map((s, i) => {
          const last = s.points[s.points.length - 1];
          return (
            <circle
              key={s.teamId}
              cx={x(new Date(last.at).getTime())}
              cy={y(last.total)}
              r={4}
              fill={seriesColor(i)}
              stroke={SURFACE}
              strokeWidth={2}
            />
          );
        })}
      </Box>

      {hoverX !== null && hoverRows.length > 0 && (
        <Box
          sx={{
            position: "absolute",
            top: 8,
            left: hoverX > width / 2 ? 8 : undefined,
            right: hoverX > width / 2 ? undefined : 8,
            px: 1.25,
            py: 1,
            borderRadius: "10px",
            background: "rgba(11,7,22,0.92)",
            border: "1px solid rgba(168,85,247,0.35)",
            pointerEvents: "none",
            minWidth: 168,
          }}
        >
          <Typography sx={{ fontSize: 10.5, color: "text.secondary", mb: 0.5 }}>
            {hoverT !== null && fmtTime(hoverT)} 時点
          </Typography>
          {[...hoverRows]
            .sort((a, b) => b.value - a.value)
            .map((r) => (
              <Box key={r.name} sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: "2px", background: r.color, flex: "0 0 auto" }} />
                <Typography sx={{ fontSize: 11, color: "text.primary", flex: 1 }}>{r.name}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                  {formatYen(r.value)}
                </Typography>
              </Box>
            ))}
        </Box>
      )}

      {/* 2系列以上あるので凡例は常に出す（色だけに identity を負わせない） */}
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mt: 1 }}>
        {series.map((s, i) => (
          <Box key={s.teamId} sx={{ display: "flex", alignItems: "center", gap: 0.625 }}>
            <Box
              sx={{ width: 14, height: 2.5, borderRadius: "2px", background: seriesColor(i), flex: "0 0 auto" }}
            />
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{s.teamName}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
