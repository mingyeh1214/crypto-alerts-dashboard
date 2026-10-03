export function taipei(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d) + " 台北";
}

export function pct(x: number | null | undefined, digits = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  const n = x * 100;
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(digits) + "%";
}

export function usd(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return sign + x.toFixed(2);
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return "—";
  return x.toLocaleString("zh-Hant", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
