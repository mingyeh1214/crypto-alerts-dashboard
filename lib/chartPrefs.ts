/** Chart preferences persisted in localStorage. */

export type MaLine = { on: boolean; kind: "EMA" | "MA"; period: number; color: string };
export type PaneKey = "volume" | "oi" | "taker" | "rsi" | "macd" | "kdj" | "atr" | "premium";

export type ChartPrefs = {
  v: 1;
  ma: MaLine[];
  bb: { on: boolean; period: number; mult: number };
  vwap: boolean;
  panes: Record<PaneKey, boolean>;
  volMa: number;
  rsiPeriod: number;
  scale: "normal" | "log" | "percent";
};

export const DEFAULT_PREFS: ChartPrefs = {
  v: 1,
  ma: [
    { on: true, kind: "EMA", period: 20, color: "#e4b15a" },
    { on: true, kind: "EMA", period: 50, color: "#b07ae4" },
    { on: true, kind: "MA", period: 99, color: "#5aa9e4" },
  ],
  bb: { on: false, period: 20, mult: 2 },
  vwap: true,
  panes: { volume: true, oi: true, taker: false, rsi: true, macd: false, kdj: false, atr: false, premium: false },
  volMa: 20,
  rsiPeriod: 14,
  scale: "normal",
};

export const PANE_LABEL: Record<PaneKey, string> = {
  volume: "成交量",
  oi: "未平倉",
  taker: "主動買賣",
  rsi: "RSI",
  macd: "MACD",
  kdj: "KDJ",
  atr: "ATR",
  premium: "溢價指數",
};

const KEY = "sentinel.chart.prefs.v1";

export function loadPrefs(): ChartPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ChartPrefs>;
    if (p.v !== 1) return DEFAULT_PREFS;
    return {
      ...DEFAULT_PREFS,
      ...p,
      bb: { ...DEFAULT_PREFS.bb, ...p.bb },
      panes: { ...DEFAULT_PREFS.panes, ...p.panes },
      ma: Array.isArray(p.ma) && p.ma.length === 3 ? p.ma : DEFAULT_PREFS.ma,
    } as ChartPrefs;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: ChartPrefs) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

export function loadList(key: string): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveList(key: string, xs: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(xs));
  } catch {
    /* ignore */
  }
}

export const FAV_KEY = "sentinel.coins.fav";
export const RECENT_KEY = "sentinel.coins.recent";
