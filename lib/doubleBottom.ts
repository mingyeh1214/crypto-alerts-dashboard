/** 15m double-bottom scan snapshot (worker → double_bottom_scan → dashboard_double_bottom()). */
export type DbStatus = "已突破" | "形成中";

export type DbRow = {
  symbol: string;
  market: "現貨＋合約" | "只有合約";
  status: DbStatus;
  l2_kind: "完整" | "暫定" | null;
  score: number | null;
  l1_time: string; l1_price: number;
  h_time: string; h_price: number;
  l2_time: string; l2_price: number;
  breakout_time: string | null;
  breakout_rvol: number | null;
  price: number | null;
  dist_neck: number | null;
  depth: number | null;
  prior_drop: number | null;
  atr14: number | null;
  vol_ratio: number | null;
  rsi_div: boolean | null;
  rsi_l1: number | null;
  rsi_l2: number | null;
  oi_l1_l2: number | null;
  oi_l2_now: number | null;
  quote_24h: number | null;
  fell_back: boolean;
  l2_age_h: number | null;
  missing_48h: number | null;
  last_1m: string | null;
};

export type DbSnapshot = {
  scanned_at?: string;
  bar_close?: string;
  coins?: number;
  breakout?: number;
  forming?: number;
  low_liquidity?: number;
  rows: DbRow[];
};

export const sec = (iso: string | null | undefined) => (iso ? Math.floor(Date.parse(iso) / 1000) : null);

/** Price with sensible significant digits for any coin size. */
export function px(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return Number(x.toPrecision(6)).toString();
}

export function compactUsd(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(0)}K`;
  return x.toFixed(0);
}
