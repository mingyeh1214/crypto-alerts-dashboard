"use client";

import { useEffect, useMemo, useState } from "react";
import { SignalChart, type ChartMarker } from "@/components/SignalChart";
import { winCells, type WinMap } from "@/components/ExtremeCell";

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
  h1_up: number | null;
  h1_dn: number | null;
  h4_up: number | null;
  h4_dn: number | null;
  d1_up: number | null;
  d1_dn: number | null;
  red: number;
  win?: WinMap | null;
};

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

function price(n: number | null) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const d = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}


const TARGETS = new Set(["GTC|2026-09-30 15:31", "SAGA|2026-09-10 21:39", "SAND|2026-10-02 14:51"]);

export function LockedBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
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

  const coins = useMemo(() => {
    const map = new Map<string, { pair: string; n: number }>();
    for (const s of data?.signals ?? []) {
      const cur = map.get(s.symbol) ?? { pair: s.pair, n: 0 };
      cur.n += 1;
      map.set(s.symbol, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }));
  }, [data]);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    let rows = data?.signals ?? [];
    if (query) rows = rows.filter((r) => r.symbol.includes(query) || r.pair.includes(query));
    if (redOnly) rows = rows.filter((r) => r.red === 1);
    const copy = [...rows];
    copy.sort((a, b) => {
      const c = compareSignals(a, b, sort.key, sort.dir);
      if (c !== 0) return c;
      return b.open_ms - a.open_ms || a.symbol.localeCompare(b.symbol, "en");
    });
    return copy;
  }, [data, q, redOnly, sort]);

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
    return (data?.signals ?? [])
      .filter((s) => s.pair === pair)
      .map((s) => ({ open_ms: s.open_ms, label: s.tp.slice(5, 16) }));
  }, [data, pair]);

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
        <div className="card"><b>{data.n}</b><span>鎖定訊號</span><em>{data.symbols} 檔現貨</em></div>
        <div className="card"><b>{data.per_day}</b><span>平均筆數／日</span><em>同幣冷卻 24 小時</em></div>
        <div className="card"><b>{num(data.score_median, 0)}</b><span>Score 中位（1–10）</span><em>均值 {num(data.score_mean, 2)}</em></div>
        <div className="card"><b>{data.score_high_n}</b><span>Score 8–10</span><em>1–3 分有 {data.score_low_n} 筆</em></div>
        <div className="card"><b>{data.red_flag_n}</b><span>任一時窗 ≤ −10%</span><em>其中 ≤ −15% 有 {data.red_flag_15_n} 筆</em></div>
      </div>
      <p className="note">
        視窗 {data.first_tp} → {data.last_tp}（台北）。Score 是 1–10 的整數，10 最好：四個時窗的優勢加權後，在這 432 筆裡切十分位，再套紅旗。
        GTC 9/30 15:31、SAGA 9/10 21:39、SAND 10/02 14:51 都在表內。
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
      <p className="note">點欄位標題可在升序與降序之間切換，空值排在最後。點時間或幣別會把上面的 K 線跳到那一筆。每一格是進場之後該時段的最大漲或最大跌：價位、台北時間、相對進場收盤的漲跌幅。15 分／1 時／4 時／1 日分別是之後 15、60、240、1440 根 1 分 K 的最高價與最低價；時間是那根 K 的開盤。標「未滿」表示資料還沒走完。最大漲跌欄位依漲跌幅排序。</p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <SortTh col="time" label="發送（台北）" left />
              <SortTh col="symbol" label="幣" left />
              <SortTh col="entry" label="進場價" />
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
                    {s.red ? <span className="sym"> 紅旗</span> : null}
                  </td>
                  <td>{price(s.entry)}</td>
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
                <td className="left" colSpan={16}>沒有符合的訊號。</td>
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
