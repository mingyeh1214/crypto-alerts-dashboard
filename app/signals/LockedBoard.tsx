"use client";

import { useEffect, useMemo, useState } from "react";
import { SignalChart, type ChartMarker } from "@/components/SignalChart";
import { winCells, type WinCell, type WinMap } from "@/components/ExtremeCell";
import { taipei } from "@/lib/format";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import cohortE from "@/lib/cohort-e.json";

type SignalContext = {
  stance?: string;
  stance_label?: string;
  note?: string;
  layer_b4?: boolean;
  layer_b5?: boolean;
  action?: string;
  action_label?: string;
  action_note?: string;
  climax?: boolean;
  long_bias?: boolean;
  play?: string;
  play_label?: string;
  play_note?: string;
  play_k?: number;
  play_reason?: string;
};

type Signal = {
  symbol: string;
  context?: SignalContext | null;
  pair: string;
  tp: string;
  open_ms: number;
  entry: number | null;
  score: number | null;
  score_base?: number | null;
  E?: number | null;
  z: number | null;
  turn_pct: number | null;
  atr15_pct: number | null;
  funding_pct: number | null;
  volume: number | null;
  quote_usdt: number | null;
  h1_up: number | null;
  h1_dn: number | null;
  h4_up: number | null;
  h4_dn: number | null;
  d1_up: number | null;
  d1_dn: number | null;
  red: number;
  win?: WinMap | null;
  live?: boolean;
};

type SentRow = {
  id: number;
  symbol: string;
  triggered_at: string;
  telegram_sent?: boolean;
  open_ms: number | null;
  entry: number | null;
  volume: number | null;
  quote_usdt: number | null;
  z: number | null;
  turn: number | null;
  atr15_pct: number | null;
  funding: number | null;
  context?: SignalContext | null;
};

type Feed = {
  generated_at: string;
  sent: SentRow[];
  unsent: { id: number; symbol: string; open_ms: number | null }[];
};

type Candle = { time: number; high: number; low: number };

type Payload = {
  n: number;
  symbols: number;
  per_day: number;
  first_tp: string;
  last_tp: string;
  score_mean: number;
  score_median: number;
  score_high_n: number;
  score_low_n: number;
  red_flag_n: number;
  red_flag_15_n: number;
  context_b4_n?: number;
  context_b5_n?: number;
  context_action?: Record<string, number>;
  context_long_bias_n?: number;
  context_play?: Record<string, number>;
  context_play_sept?: Record<string, number>;
  signals: Signal[];
};

type SortKey =
  | "time"
  | "symbol"
  | "entry"
  | "z"
  | "turn"
  | "atr"
  | "funding"
  | "volume"
  | "quote"
  | "score"
  | "ctx"
  | "action"
  | "play"
  | "m15_up"
  | "m15_dn"
  | "h1_up"
  | "h1_dn"
  | "h4_up"
  | "h4_dn"
  | "d1_up"
  | "d1_dn";

type SortDir = "asc" | "desc";

const WIN_COLS: { key: SortKey; label: string }[] = [
  { key: "m15_up", label: "15分最大漲" },
  { key: "m15_dn", label: "15分最大跌" },
  { key: "h1_up", label: "1時最大漲" },
  { key: "h1_dn", label: "1時最大跌" },
  { key: "h4_up", label: "4時最大漲" },
  { key: "h4_dn", label: "4時最大跌" },
  { key: "d1_up", label: "1日最大漲" },
  { key: "d1_dn", label: "1日最大跌" },
];

function sortValue(s: Signal, key: SortKey): number | string | null {
  switch (key) {
    case "time":
      return s.open_ms;
    case "symbol":
      return s.symbol;
    case "entry":
      return s.entry;
    case "z":
      return s.z;
    case "turn":
      return s.turn_pct;
    case "atr":
      return s.atr15_pct;
    case "funding":
      return s.funding_pct;
    case "volume":
      return s.volume;
    case "quote":
      return s.quote_usdt;
    case "score":
      return s.score;
    case "ctx":
      if (!s.context) return null;
      return (s.context.layer_b5 ? 2 : 0) + (s.context.layer_b4 ? 1 : 0);
    case "action": {
      const order: Record<string, number> = { long: 3, fade_watch: 2, skip: 1, neutral: 0 };
      if (!s.context?.action) return null;
      return order[s.context.action] ?? -1;
    }
    case "play": {
      const order: Record<string, number> = { enter: 2, wait: 1, abandon: 0 };
      if (!s.context?.play) return null;
      return order[s.context.play] ?? -1;
    }
    default: {
      const [win, side] = key.split("_") as ["m15" | "h1" | "h4" | "d1", "up" | "dn"];
      const cell = s.win?.[win];
      if (!cell) return null;
      return side === "up" ? cell.up : cell.dn;
    }
  }
}

function compareSignals(a: Signal, b: Signal, key: SortKey, dir: SortDir): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  if (key === "symbol") {
    const c = String(av ?? "").localeCompare(String(bv ?? ""), "en", { sensitivity: "base", numeric: true });
    return dir === "asc" ? c : -c;
  }
  const an = av == null || (typeof av === "number" && Number.isNaN(av));
  const bn = bv == null || (typeof bv === "number" && Number.isNaN(bv));
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  const c = (av as number) - (bv as number);
  return dir === "asc" ? c : -c;
}

function cls(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n > 0 ? "up" : "dn";
}

function scoreCls(n: number | null | undefined) {
  if (n == null) return "";
  if (n >= 8) return "up";
  if (n <= 3) return "dn";
  return "";
}

function actionCls(action: string | undefined) {
  if (action === "long") return "act-long";
  if (action === "fade_watch") return "act-fade";
  if (action === "skip") return "act-skip";
  if (action === "neutral") return "act-neutral";
  return "";
}

function playCls(play: string | undefined) {
  if (play === "enter") return "act-long";
  if (play === "wait") return "act-fade";
  if (play === "abandon") return "act-skip";
  return "";
}

function num(n: number | null | undefined, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
}

function amt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
  }
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function price(n: number | null) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const d = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}



const POLL_MS = 5_000;

function tpFromMs(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

function sentToSignal(e: SentRow): Signal | null {
  if (e.open_ms == null) return null;
  const pair = e.symbol.toUpperCase();
  const symbol = pair.endsWith("USDT") ? pair.slice(0, -4) : pair;
  return {
    symbol,
    pair,
    tp: tpFromMs(e.open_ms),
    open_ms: e.open_ms,
    entry: e.entry,
    score: null,
    z: e.z == null ? null : Math.round(e.z * 1000) / 1000,
    turn_pct: e.turn == null ? null : e.turn * 100,
    atr15_pct: e.atr15_pct,
    funding_pct: e.funding == null ? null : e.funding * 100,
    volume: e.volume,
    quote_usdt: e.quote_usdt,
    h1_up: null,
    h1_dn: null,
    h4_up: null,
    h4_dn: null,
    d1_up: null,
    d1_dn: null,
    red: 0,
    win: null,
    live: true,
    context: e.context ?? null,
  };
}

function dropKey(symbol: string, openMs: number | null) {
  if (openMs == null) return "";
  const pair = symbol.toUpperCase();
  return `${pair}|${openMs}`;
}

function mergeSignals(hist: Signal[], feed: Feed | null): Signal[] {
  // Full locked backtest stays on this page. Live rows are added on top, never used to hide history.
  const sentKeys = new Set(
    (feed?.sent ?? [])
      .filter((e) => e.telegram_sent !== false)
      .map((e) => dropKey(e.symbol, e.open_ms))
      .filter(Boolean),
  );
  const rows: Signal[] = hist.map((s) => (sentKeys.has(`${s.pair}|${s.open_ms}`) ? { ...s, live: true } : { ...s, live: !!s.live }));
  const have = new Set(rows.map((s) => `${s.pair}|${s.open_ms}`));
  for (const e of feed?.sent ?? []) {
    const sig = sentToSignal(e);
    if (!sig) continue;
    sig.live = e.telegram_sent !== false;
    const key = `${sig.pair}|${sig.open_ms}`;
    if (have.has(key)) continue;
    have.add(key);
    rows.push(sig);
  }
  return rows;
}

const COHORT = cohortE as number[];

function scorePath(win: WinMap | null | undefined): { score: number | null; score_base: number | null; E: number | null; red: number } {
  if (!win) return { score: null, score_base: null, E: null, red: 0 };
  const weights = { m15: 0.15, h1: 0.35, h4: 0.3, d1: 0.2 } as const;
  let E = 0;
  let any = false;
  for (const k of ["m15", "h1", "h4", "d1"] as const) {
    const cell = win[k];
    if (!cell) continue;
    any = true;
    E += weights[k] * (cell.up + cell.dn) * 100;
  }
  if (!any) return { score: null, score_base: null, E: null, red: 0 };
  E = Math.round(E * 10000) / 10000;
  let rank = 0;
  for (const x of COHORT) {
    if (x > E) rank += 1;
    else break;
  }
  const n = COHORT.length || 1;
  const base = 10 - Math.min(9, Math.floor((rank * 10) / n));
  const dns = (["m15", "h1", "h4", "d1"] as const).map((k) => win[k]?.dn).filter((d): d is number => d != null);
  const red15 = dns.some((d) => d <= -0.15);
  const red10 = dns.some((d) => d <= -0.1);
  let score = base;
  if (red15) score = 1;
  else if (red10) score = Math.min(score, 3);
  return { score, score_base: base, E, red: red10 ? 1 : 0 };
}

function extreme(slice: Candle[], entry: number, side: "up" | "dn"): { px: number; t: string; p: number } {
  let i = 0;
  slice.forEach((c, idx) => {
    if (side === "up" ? c.high > slice[i].high : c.low < slice[i].low) i = idx;
  });
  const px = side === "up" ? slice[i].high : slice[i].low;
  return { px, t: tpFromMs(slice[i].time * 1000), p: px / entry - 1 };
}

function windowCell(candles: Candle[], entry: number, openMs: number, bars: number): WinCell | null {
  const after = candles.filter((c) => c.time * 1000 > openMs);
  const slice = after.slice(0, bars);
  if (!slice.length || entry <= 0) return null;
  const up = extreme(slice, entry, "up");
  const dn = extreme(slice, entry, "dn");
  return {
    up_px: up.px,
    up_t: up.t,
    up: up.p,
    dn_px: dn.px,
    dn_t: dn.t,
    dn: dn.p,
    n: slice.length,
    full: slice.length === bars,
  };
}

function buildWin(candles: Candle[], entry: number, openMs: number): WinMap | null {
  const m15 = windowCell(candles, entry, openMs, 15);
  const h1 = windowCell(candles, entry, openMs, 60);
  const h4 = windowCell(candles, entry, openMs, 240);
  const d1 = windowCell(candles, entry, openMs, 1440);
  if (!m15 && !h1 && !h4 && !d1) return null;
  return { m15, h1, h4, d1 };
}

function applyWin(s: Signal, win: WinMap | null | undefined): Signal {
  if (!win) return s;
  const dns = [win.m15, win.h1, win.h4, win.d1].map((c) => c?.dn).filter((n): n is number => n != null);
  const worst = dns.length ? Math.min(...dns) : 0;
  return {
    ...s,
    win,
    h1_up: win.h1 ? win.h1.up * 100 : s.h1_up,
    h1_dn: win.h1 ? win.h1.dn * 100 : s.h1_dn,
    h4_up: win.h4 ? win.h4.up * 100 : s.h4_up,
    h4_dn: win.h4 ? win.h4.dn * 100 : s.h4_dn,
    d1_up: win.d1 ? win.d1.up * 100 : s.d1_up,
    d1_dn: win.d1 ? win.d1.dn * 100 : s.d1_dn,
    red: worst <= -0.1 ? 1 : s.red,
  };
}

const TARGETS = new Set(["GTC|2026-09-30 15:31", "SAGA|2026-09-10 21:39", "SAND|2026-10-02 14:51"]);

export function LockedBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [feedErr, setFeedErr] = useState("");
  const [feedAt, setFeedAt] = useState("");
  const [extraWins, setExtraWins] = useState<Record<string, WinMap>>({});
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "time", dir: "desc" });
  const [redOnly, setRedOnly] = useState(false);
  const [b4Only, setB4Only] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [playFilter, setPlayFilter] = useState<string>("");
  const [interval, setInterval] = useState("15m");
  const [pair, setPair] = useState("");
  const [focusMs, setFocusMs] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/data/locked_signals.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((json: Payload) => setData(json))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "讀取失敗"));
  }, []);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_p12_feed`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          body: "{}",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as Feed;
        if (cancel) return;
        setFeed(json);
        setFeedAt(new Date().toISOString());
        setFeedErr("");
      } catch (e) {
        if (!cancel) setFeedErr(e instanceof Error ? e.message : "即時讀取失敗");
      }
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancel = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const merged = useMemo(
    () => mergeSignals(data?.signals ?? [], feed).map((s) => {
      const extra = extraWins[`${s.pair}|${s.open_ms}`];
      const withWin = applyWin(s, extra ?? s.win);
      if (!extra) return withWin;
      const scored = scorePath(extra);
      return { ...withWin, ...scored };
    }),
    [data, feed, extraWins],
  );

  useEffect(() => {
    setPair((cur) => (cur && merged.some((s) => s.pair === cur) ? cur : merged[0]?.pair ?? ""));
  }, [merged]);

  const liveKey = useMemo(
    () =>
      merged
        .filter((s) => s.live && s.entry != null && !s.win?.d1?.full)
        .map((s) => `${s.pair}|${s.open_ms}|${s.entry}`)
        .join(","),
    [merged],
  );

  useEffect(() => {
    if (!liveKey) return;
    const need = liveKey.split(",").map((part) => {
      const [pair, openRaw, entryRaw] = part.split("|");
      return { pair, open_ms: Number(openRaw), entry: Number(entryRaw) };
    });
    let cancel = false;
    async function fill() {
      for (const s of need) {
        if (cancel || !s.pair || !Number.isFinite(s.entry)) return;
        try {
          const res = await fetch("/api/signal-windows", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: [{ id: s.open_ms, pair: s.pair, open_ms: s.open_ms, entry: s.entry }] }),
          });
          if (!res.ok) continue;
          const json = (await res.json()) as { rows?: { win?: WinMap }[] };
          const win = json.rows?.[0]?.win;
          if (cancel || !win) continue;
          setExtraWins((prev) => ({ ...prev, [`${s.pair}|${s.open_ms}`]: win }));
        } catch {
          /* keep the row; windows fill on the next pass */
        }
      }
    }
    fill();
    const id = window.setInterval(fill, 60_000);
    return () => {
      cancel = true;
      window.clearInterval(id);
    };
  }, [liveKey]);

  const coins = useMemo(() => {
    const map = new Map<string, { pair: string; n: number }>();
    for (const s of merged) {
      const cur = map.get(s.symbol) ?? { pair: s.pair, n: 0 };
      cur.n += 1;
      map.set(s.symbol, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }));
  }, [merged]);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    let rows = merged;
    if (query) rows = rows.filter((r) => r.symbol.includes(query) || r.pair.includes(query));
    if (redOnly) rows = rows.filter((r) => r.red === 1);
    if (b4Only) rows = rows.filter((r) => r.context?.layer_b4);
    if (actionFilter) rows = rows.filter((r) => r.context?.action_label === actionFilter);
    if (playFilter) rows = rows.filter((r) => r.context?.play_label === playFilter);
    const copy = [...rows];
    copy.sort((a, b) => {
      const c = compareSignals(a, b, sort.key, sort.dir);
      if (c !== 0) return c;
      return b.open_ms - a.open_ms || a.symbol.localeCompare(b.symbol, "en");
    });
    return copy;
  }, [merged, q, redOnly, b4Only, actionFilter, playFilter, sort]);

  useEffect(() => setPage(0), [q, redOnly, b4Only, actionFilter, playFilter, sort.key, sort.dir]);

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return { key, dir: key === "symbol" ? "asc" : "desc" };
    });
  }

  function SortTh({ col, label, left }: { col: SortKey; label: string; left?: boolean }) {
    const on = sort.key === col;
    return (
      <th className={left ? "left" : undefined} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" className={on ? "sort-th on" : "sort-th"} onClick={() => toggleSort(col)}>
          {label}
          <span className="sort-mark">{on ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span>
        </button>
      </th>
    );
  }

  const markers: ChartMarker[] = useMemo(() => {
    return merged
      .filter((s) => s.pair === pair)
      .map((s) => ({ open_ms: s.open_ms, label: s.tp.slice(5, 16) }));
  }, [merged, pair]);

  const pageSize = 40;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const coinN = coins.find((c) => c[1].pair === pair)?.[1].n ?? markers.length;

  function openSignal(s: Signal) {
    setPair(s.pair);
    setFocusMs(s.open_ms);
    document.getElementById("kline")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!data && err) return <p className="err">訊號表讀不到：{err}</p>;
  if (!data) return <p className="note">讀取鎖定訊號…</p>;

  return (
    <section>
      {pair ? <div className="chart-sticky" id="kline">
      <h2>K 線與訊號時間</h2>
      <div className="toolbar">
        <label className="field">
          幣別
          <select
            value={pair}
            onChange={(e) => {
              setPair(e.target.value);
              setFocusMs(null);
            }}
          >
            {coins.map(([sym, info]) => (
              <option key={info.pair} value={info.pair}>
                {sym} · {info.n} 筆
              </option>
            ))}
          </select>
        </label>
        <div className="seg" role="group" aria-label="K 線週期">
          {["1m", "5m", "15m", "1h", "4h", "1d"].map((iv) => (
            <button key={iv} type="button" className={interval === iv ? "on" : ""} onClick={() => setInterval(iv)}>
              {iv}
            </button>
          ))}
        </div>
        <span className="note">{pair.replace(/USDT$/, "")} 本頁 {coinN} 筆訊號</span>
      </div>
      <SignalChart
        pair={pair}
        interval={interval}
        markers={markers}
        focusMs={focusMs}
      />
    </div> : <p className="note">還沒有訊號。</p>}


      <div className="cards">
        <div className="card"><b>{merged.length}</b><span>鎖定訊號</span><em>{new Set(merged.map((s) => s.symbol)).size} 檔現貨</em></div>
        <div className="card"><b>{data.per_day}</b><span>平均筆數／日</span><em>同幣冷卻 24 小時</em></div>
        <div className="card"><b>{merged.filter((s) => (s.score ?? 0) >= 8).length}</b><span>Score 8–10</span><em>1–3 分有 {merged.filter((s) => s.score != null && s.score <= 3).length} 筆</em></div>
        <div className="card"><b>{merged.filter((s) => s.red === 1).length}</b><span>任一時窗 ≤ −10%</span><em>其中 ≤ −15% 有 {data.red_flag_15_n} 筆</em></div>
      </div>
      <p className="note">
        明細含 9 月起的鎖定規則回測（Score、時窗優勢、當下量能都在），再加上之後寫進 alerts 的進場。已送到 Telegram 的列標「已送」，每 5 秒與即時頁對齊；沒送出的回測補庫一樣留在這頁。
        新進場的 Score 等走勢出來才算，對到研究樣本 {COHORT.length} 筆的十分位，窗未滿會再更新。
        當下位置是訊號那一刻的均線、RSI、近 7 日和量能解讀；當下建議是作多／淡倉觀察／略過／中性標籤，不是後面會漲或會跌的判斷，也不自動開空。這份清單裡起漲四條同時落在帶內的有 {data.context_b4_n ?? "—"} 筆，其中 20 日位置也在帶內的有 {data.context_b5_n ?? "—"} 筆。建議分佈：作多 {data.context_action?.["作多"] ?? "—"}、淡倉觀察 {data.context_action?.["淡倉觀察"] ?? "—"}、略過 {data.context_action?.["略過"] ?? "—"}、中性 {data.context_action?.["中性"] ?? "—"}；資金費為負或價漲 OI 跌的偏多註解有 {data.context_long_bias_n ?? "—"} 筆。一小時手冊（已走完的小時會把等待改判放棄）：進場 {data.context_play?.["進場"] ?? "—"}、等待 {data.context_play?.["等待"] ?? "—"}、放棄 {data.context_play?.["放棄"] ?? "—"}。其中九月進場 {data.context_play_sept?.["進場"] ?? "—"}、放棄 {data.context_play_sept?.["放棄"] ?? "—"}。
        {feedAt ? `上次抓取 ${taipei(feedAt)}` : "正在接即時訊號…"}
        {feedErr ? `（即時更新失敗：${feedErr}）` : ""}
      </p>

      <h2>訊號明細</h2>
      <div className="filters">
        <label className="field">
          搜尋幣別
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="GTC / SAGA" />
        </label>
        <label className="field inline">
          <input type="checkbox" checked={redOnly} onChange={(e) => setRedOnly(e.target.checked)} />
          只看 ≤ −10% 紅旗
        </label>
        <label className="field inline">
          <input type="checkbox" checked={b4Only} onChange={(e) => setB4Only(e.target.checked)} />
          只看起漲四條帶內
        </label>
        <label className="field">
          當下建議
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="作多">作多</option>
            <option value="淡倉觀察">淡倉觀察</option>
            <option value="略過">略過</option>
            <option value="中性">中性</option>
          </select>
        </label>
        <label className="field">
          一小時手冊
          <select value={playFilter} onChange={(e) => setPlayFilter(e.target.value)}>
            <option value="">全部</option>
            <option value="進場">進場</option>
            <option value="等待">等待</option>
            <option value="放棄">放棄</option>
          </select>
        </label>
      </div>
      <p className="note">當下建議優先序：起漲四條→作多；pos20≥0.95 且 RSI4h≥78 且離日線≥12%→淡倉觀察（不自動空）；中段延伸→略過；其餘中性。資金費為負或價漲 OI 跌只加偏多註解。一小時手冊是另一層：只在訊號當下，起漲四條、上影小於振幅 55%、止損距離 0.45%～3.2%，才標進場；停利 1.5R 一次全出，否則 12 小時走。其餘先標等待，這一小時只會改判放棄（破低、收回前一分下、BTC 急殺、量塌），不會改判進場，滿 60 分沒進也是放棄。不自動開空。已走完的訊號直接顯示最後結果。當下位置對照的是：日線 EMA20 上方 0%～8%、4h EMA20 上方 0%～5%、4h RSI 45～65、近 7 日約 −4%～+10%。四條同時成立標成貼均線起漲帶；20 日位置 0.35～0.80 是再加的一條。這欄只描述訊號當下，不用進場之後的漲跌。當下交易量是訊號那一根 1 分 K 的基礎幣成交量，當下交易金額是同一根的 USDT 成交額。點欄位標題可在升序與降序之間切換，空值排在最後。點時間或幣別會把上面的 K 線跳到那一筆。每一格是進場之後該時段的最大漲或最大跌：價位、台北時間、相對進場收盤的漲跌幅。15 分／1 時／4 時／1 日分別是之後 15、60、240、1440 根 1 分 K 的最高價與最低價；時間是那根 K 的開盤。標「未滿」表示資料還沒走完。最大漲跌欄位依漲跌幅排序。</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <SortTh col="time" label="發送（台北）" left />
              <SortTh col="symbol" label="幣" left />
              <SortTh col="entry" label="進場價" />
              <SortTh col="volume" label="當下交易量" />
              <SortTh col="quote" label="當下交易金額" />
              <SortTh col="z" label="z" />
              <SortTh col="turn" label="轉強" />
              <SortTh col="atr" label="ATR%" />
              <SortTh col="funding" label="資金費率" />
              <SortTh col="action" label="當下建議" left />
              <SortTh col="play" label="一小時手冊" left />
              <SortTh col="ctx" label="當下位置" left />
              <SortTh col="score" label="Score" />
              {WIN_COLS.map((c) => (
                <SortTh key={c.key} col={c.key} label={c.label} />
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((s) => {
              const pinned = TARGETS.has(`${s.symbol}|${s.tp}`);
              return (
                <tr key={`${s.pair}-${s.open_ms}`} className={pinned || (focusMs === s.open_ms && pair === s.pair) ? "pinned" : ""}>
                  <td className="left">
                    <button type="button" className="linkish" onClick={() => openSignal(s)}>
                      {s.tp}
                    </button>
                  </td>
                  <td className="left">
                    <button type="button" className="linkish" onClick={() => openSignal(s)}>
                      {s.symbol}
                    </button>
                    {s.live ? <span className="sym"> 已送</span> : null}
                    {s.red ? <span className="sym"> 紅旗</span> : null}
                  </td>
                  <td>{price(s.entry)}</td>
                  <td title={s.volume == null ? undefined : String(s.volume)}>{amt(s.volume)}</td>
                  <td title={s.quote_usdt == null ? undefined : `${s.quote_usdt} USDT`}>{amt(s.quote_usdt)}</td>
                  <td>{num(s.z, 2)}</td>
                  <td>{s.turn_pct == null ? "—" : `${num(s.turn_pct, 2)}%`}</td>
                  <td>{s.atr15_pct == null ? "—" : num(s.atr15_pct, 2)}</td>
                  <td className={cls(s.funding_pct)}>{s.funding_pct == null ? "—" : `${num(s.funding_pct, 4)}%`}</td>
                  <td className={`left action ${actionCls(s.context?.action)}`} title={s.context?.action_note}>
                    <b>{s.context?.action_label ?? "—"}</b>
                    {s.context?.action_note ? <div>{s.context.action_note}</div> : null}
                  </td>
                  <td className={`left action ${playCls(s.context?.play)}`} title={s.context?.play_note}>
                    <b>{s.context?.play_label ?? "—"}</b>
                    {s.context?.play_note ? <div>{s.context.play_k ? `第 ${s.context.play_k} 分 · ` : ""}{s.context.play_note}</div> : null}
                  </td>
                  <td className="left ctx" title={s.context?.note}>
                    <b>{s.context?.stance_label ?? "—"}</b>
                    {s.context?.note ? <div>{s.context.note}</div> : null}
                  </td>
                  <td className={scoreCls(s.score)} title={s.E == null ? undefined : `E ${num(s.E, 2)} · 分位 ${s.score_base ?? "—"}`}>{s.score == null ? "—" : s.score}</td>
                  {winCells(s.win, s.pair + s.open_ms)}
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td className="left" colSpan={20}>沒有符合的訊號。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span>
          {filtered.length === 0 ? "0" : `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)}`} / {filtered.length}
        </span>
        <button type="button" className="btn" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>上一頁</button>
        <button type="button" className="btn" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>下一頁</button>
      </div>
    </section>
  );
}
