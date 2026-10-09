import SPOT_MAP from "./spot-map.json";
import UNIVERSE from "./market-universe.json";

/** Shared types and copy for the handover research rule. */

export type SignalStatus = "pending" | "passed" | "failed" | "error";

/** One burst as shown on the site (live rows and backtest rows share this). */
export type Burst = {
  key: string;
  symbol: string;
  /** Burst bar close, UTC ms. */
  closeMs: number;
  close: number | null;
  ret: number | null;
  rvol: number | null;
  taker: number | null;
  oiChg: number | null;
  status: SignalStatus;
  obsP: number | null;
  obsTrend?: number | null;
  r4h?: number | null;
  source: "live" | "manual" | "oos";
  spotSymbol?: string | null;
  telegram?: boolean;
  reason?: string | null;
};

export type LiveRow = {
  id: number;
  symbol: string;
  spot_symbol?: string | null;
  burst_open: string;
  burst_close: string;
  decide_at: string;
  status: SignalStatus;
  reason: string | null;
  close: number | null;
  volume: number | null;
  ret: number | null;
  rvol: number | null;
  taker_ratio: number | null;
  delta_z: number | null;
  oi_chg: number | null;
  obs_trend: number | null;
  obs_p: number | null;
  telegram_sent: boolean;
};

export type BacktestRow = {
  s: string; t: string; c: number | null; r: number | null; v: number | null; k: number | null;
  o: number | null; st: SignalStatus; p: number | null; h4: number | null; src: "manual" | "oos";
};

/** The site hides layer-2 failures (未過); the worker still records them for research. */
export const isShown = (s: SignalStatus) => s !== "failed";

export const MARK_COLOR: Record<SignalStatus, string> = {
  passed: "#3cbe88",
  failed: "#e36d6d",
  pending: "#7fa6d9", // blue-grey, so no orange/amber marker is ever drawn on the chart
  error: "#8b97a8",
};

export const STATUS_LABEL: Record<SignalStatus, string> = {
  pending: "觀察中",
  passed: "通過",
  failed: "未過",
  error: "資料不足",
};

/** "2026-10-08 16:15" (Taipei wall clock) -> UTC ms. */
export function taipeiToMs(t: string): number {
  return Date.parse(t.replace(" ", "T") + ":00+08:00");
}

export function fromLive(r: LiveRow): Burst {
  return {
    key: `live-${r.id}`,
    symbol: r.symbol,
    closeMs: Date.parse(r.burst_close),
    close: r.close,
    ret: r.ret,
    rvol: r.rvol,
    taker: r.taker_ratio,
    oiChg: r.oi_chg,
    status: r.status,
    obsP: r.obs_p,
    obsTrend: r.obs_trend,
    source: "live",
    spotSymbol: r.spot_symbol ?? null,
    telegram: r.telegram_sent,
    reason: r.reason,
  };
}

export function fromBacktest(r: BacktestRow, i: number): Burst {
  return {
    key: `${r.src}-${r.s}-${r.t}-${i}`,
    symbol: r.s,
    closeMs: taipeiToMs(r.t),
    close: r.c,
    ret: r.r,
    rvol: r.v,
    taker: r.k,
    oiChg: r.o,
    status: r.st,
    obsP: r.p,
    r4h: r.h4,
    source: r.src,
  };
}

export const CONDITIONS: { n: number; label: string; detail: string }[] = [
  { n: 1, label: "相對量 > 3", detail: "這根 5 分 K 的成交量（幣數）除以「同一個台北小時」前面最多 240 根的中位數（至少要 84 根，不含當根）。" },
  { n: 2, label: "主動買賣比 > 1.05", detail: "幣安合約 5 分鐘主動買量 ÷ 主動賣量。" },
  { n: 3, label: "主動淨額 z > 1.5", detail: "主動淨額 = 成交量 × (比值−1)/(比值+1)，再用同一個台北小時前 240 根的平均與標準差算 z。" },
  { n: 4, label: "漲幅 > 0.8%", detail: "收盤相對前一根 5 分 K 收盤。" },
  { n: 5, label: "收紅且 CLV > 0.6", detail: "收盤高於開盤，且收在當根高低區間的上 40%。" },
  { n: 6, label: "收盤 > 當日 VWAP", detail: "VWAP 每天台北 00:00 重算，用 (高+低+收)/3 × 成交量。" },
  { n: 7, label: "未平倉量變化 > 0.3%", detail: "這根的未平倉幣數相對前一根。" },
  { n: 8, label: "突破前 4 小時高點", detail: "收盤高於前 48 根 5 分 K 的最高價。" },
  { n: 9, label: "上影線 < 0.45", detail: "(最高 − max(開, 收)) ÷ (最高 − 最低)。" },
  { n: 10, label: "現貨同時上漲", detail: "同名現貨這 5 分鐘收盤高於前一根。沒有現貨的幣永遠不會過這條。" },
];


/** Same-name spot pair for a USDT-M perp (1000PEPEUSDT -> PEPEUSDT). */
export function spotOf(perp: string, hint?: string | null): string {
  return hint || (SPOT_MAP as Record<string, string>)[perp] || perp;
}

/** Market type per perp symbol, from a market_universe snapshot (lib/market-universe.json). */
export type MarketType = "both" | "perp";
const MT = new Map<string, MarketType>([
  ...UNIVERSE.spotPerp.map((x) => [x, "both"] as [string, MarketType]),
  ...UNIVERSE.perpOnly.map((x) => [x, "perp"] as [string, MarketType]),
]);
export const ALL_PERPS: string[] = [...MT.keys()];
export const marketType = (s: string): MarketType | null => MT.get(s) ?? null;
export const MARKET_LABEL: Record<MarketType, string> = { both: "現貨＋合約", perp: "只有合約" };
