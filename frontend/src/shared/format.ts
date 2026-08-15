const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  signDisplay: "exceptZero",
});

/** 賞金額を "+¥500" / "-¥100" / "¥0" のように整形する（0円には符号を付けない） */
export function formatPrize(prize: number): string {
  return yen.format(prize);
}

export function prizeColor(prize: number): "success.main" | "error.main" | "text.secondary" {
  if (prize > 0) return "success.main";
  if (prize < 0) return "error.main";
  return "text.secondary";
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", { month: "2-digit", day: "2-digit" });
}
