import { pct } from "@/lib/format";

export type WinCell = {
  up_px: number;
  up_t: string;
  up: number;
  dn_px: number;
  dn_t: string;
  dn: number;
  n: number;
  full: boolean;
};

export type WinMap = {
  m15: WinCell | null;
  h1: WinCell | null;
  h4: WinCell | null;
  d1: WinCell | null;
};

export const WIN_ORDER: { key: keyof WinMap; label: string }[] = [
  { key: "m15", label: "15分" },
  { key: "h1", label: "1時" },
  { key: "h4", label: "4時" },
  { key: "d1", label: "1日" },
];

function price(n: number) {
  const abs = Math.abs(n);
  const d = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}

function shortTime(t: string) {
  return t.length >= 16 ? t.slice(5) : t;
}

export function ExtremeCell({ cell, side }: { cell: WinCell | null | undefined; side: "up" | "dn" }) {
  if (!cell) return <>—</>;
  const px = side === "up" ? cell.up_px : cell.dn_px;
  const t = side === "up" ? cell.up_t : cell.dn_t;
  const p = side === "up" ? cell.up : cell.dn;
  const klass = p > 0 ? "up" : p < 0 ? "dn" : "";
  const title = cell.full ? `${t} 台北` : `${t} 台北 · 窗口未走完（${cell.n} 根）`;
  return (
    <div className="ext" title={title}>
      <span className="px">{price(px)}</span>
      <span className="tm">
        {shortTime(t)}
        {cell.full ? "" : " 未滿"}
      </span>
      <span className={`pc ${klass}`}>{pct(p)}</span>
    </div>
  );
}

export function winHeaders() {
  return WIN_ORDER.flatMap(({ key, label }) => [
    <th key={`${key}-up`}>{label}最大漲</th>,
    <th key={`${key}-dn`}>{label}最大跌</th>,
  ]);
}

export function winCells(win: WinMap | null | undefined, keyPrefix: string) {
  return WIN_ORDER.flatMap(({ key }) => {
    const cell = win?.[key];
    return [
      <td key={`${keyPrefix}-${key}-up`}>
        <ExtremeCell cell={cell} side="up" />
      </td>,
      <td key={`${keyPrefix}-${key}-dn`}>
        <ExtremeCell cell={cell} side="dn" />
      </td>,
    ];
  });
}

export function winCsv(win: WinMap | null | undefined): string[] {
  const out: string[] = [];
  for (const { key } of WIN_ORDER) {
    const cell = win?.[key];
    if (!cell) {
      out.push("", "", "", "", "", "", "");
      continue;
    }
    out.push(
      String(cell.up_px),
      cell.up_t,
      String(cell.up),
      String(cell.dn_px),
      cell.dn_t,
      String(cell.dn),
      cell.full ? "1" : "0",
    );
  }
  return out;
}

export const WIN_CSV_HEADER = WIN_ORDER.flatMap(({ key }) => [
  `${key}_up_px`,
  `${key}_up_time_taipei`,
  `${key}_up_pct`,
  `${key}_dn_px`,
  `${key}_dn_time_taipei`,
  `${key}_dn_pct`,
  `${key}_full`,
]).join(",");
