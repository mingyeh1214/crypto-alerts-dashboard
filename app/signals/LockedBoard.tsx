"use client";

import { useEffect, useMemo, useState } from "react";
import { SignalChart, type ChartMarker } from "@/components/SignalChart";
import { winCells, type WinCell, type WinMap } from "@/components/ExtremeCell";
import { taipei } from "@/lib/format";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";

type Signal = {
  symbol: string;
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
  open_ms: number | null;
  entry: number | null;
  volume: number | null;
  quote_usdt: number | null;
  z: number | null;
  turn: number | null;
  atr15_pct: number | null;
  funding: number | null;
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
  };
}

function dropKey(symbol: string, openMs: number | null) {
  if (openMs == null) return "";
  const pair = symbol.toUpperCase();
  return `${pair}|${openMs}`;
}

function mergeSignals(hist: Signal[], feed: Feed | null): Signal[] {
  const unsent = new Set((feed?.unsent ?? []).map((u) => dropKey(u.symbol, u.open_ms)));
  const rows = hist.filter((s) => !unsent.has(`${s.pair}|${s.open_ms}`));
  const have = new Set(rows.map((s) => `${s.pair}|${s.open_ms}`));
  for (const e of feed?.sent ?? []) {
    const sig = sentToSignal(e);
    if (!sig) continue;
    const key = `${sig.pair}|${sig.open_ms}`;
    if (have.has(key)) continue;
    have.add(key);
    rows.push(sig);
  }
  return rows;
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
  const [interval, setInterval] = useState("15m");
  const [pair, setPair] = useState("GTCUSDT");
  const [focusMs, setFocusMs] = useState<number | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/data/locked_signals.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Payload>;
      })
      .then(setData)
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
    () => mergeSignals(data?.signals ?? [], feed).map((s) => applyWin(s, s.win ?? extraWins[`${s.pair}|${s.open_ms}`])),
    [data, feed, extraWins],
  );

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
          const res = await fetch(`/api/klines?symbol=${encodeURIComponent(s.pair)}&interval=1m&recent=1000`, { cache: "no-store" });
          if (!res.ok) continue;
          const json = (await res.json()) as { candles?: Candle[] };
          const win = buildWin(json.candles ?? [], s.entry, s.open_ms);
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
    const copy = [...rows];
    copy.sort((a, b) => {
      const c = compareSignals(a, b, sort.key, sort.dir);
      if (c !== 0) return c;
      return b.open_ms - a.open_ms || a.symbol.localeCompare(b.symbol, "en");
    });
    return copy;
  }, [merged, q, redOnly, sort]);

  useEffect(() => setPage(0), [q, redOnly, sort.key, sort.dir]);

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

  if (err) return <p className="err">訊號表讀不到：{err}</p>;
  if (!data) return <p className="note">讀取鎖定清單…</p>;

  return (
    <section>
      <div className="chart-sticky" id="kline">
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
    </div>


      <div className="cards">
        <div className="card"><b>{merged.length}</b><span>鎖定訊號</span><em>{data.symbols} 檔現貨</em></div>
        <div className="card"><b>{data.per_day}</b><span>平均筆數／日</span><em>同幣冷卻 24 小時</em></div>
        <div className="card"><b>{num(data.score_median, 0)}</b><span>Score 中位（1–10）</span><em>均值 {num(data.score_mean, 2)}</em></div>
        <div className="card"><b>{data.score_high_n}</b><span>Score 8–10</span><em>1–3 分有 {data.score_low_n} 筆</em></div>
        <div className="card"><b>{data.red_flag_n}</b><span>任一時窗 ≤ −10%</span><em>其中 ≤ −15% 有 {data.red_flag_15_n} 筆</em></div>
      </div>
      <p className="note">
        視窗 {data.first_tp} → {merged.length ? merged.reduce((a, s) => (s.tp > a ? s.tp : a), merged[0].tp) : data.last_tp}（台北）。
        明細 {merged.length} 筆：歷史回測保留，未送 Telegram 的補庫 {feed ? feed.unsent.length : "…"} 筆已拿掉。
        已送的即時訊號每 5 秒併入這張表（與即時頁同一張 alerts），Score 仍是原本回測分位，新進場先不給分。
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
      </div>
      <p className="note">當下交易量是訊號那一根 1 分 K 的基礎幣成交量，當下交易金額是同一根的 USDT 成交額。點欄位標題可在升序與降序之間切換，空值排在最後。點時間或幣別會把上面的 K 線跳到那一筆。每一格是進場之後該時段的最大漲或最大跌：價位、台北時間、相對進場收盤的漲跌幅。15 分／1 時／4 時／1 日分別是之後 15、60、240、1440 根 1 分 K 的最高價與最低價；時間是那根 K 的開盤。標「未滿」表示資料還沒走完。最大漲跌欄位依漲跌幅排序。</p>
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
                  <td className={scoreCls(s.score)} title={s.E == null ? undefined : `E ${num(s.E, 2)} · 分位 ${s.score_base ?? "—"}`}>{s.score == null ? "—" : s.score}</td>
                  {winCells(s.win, s.pair + s.open_ms)}
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td className="left" colSpan={18}>沒有符合的訊號。</td>
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
