"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoinPicker, type CoinInfo } from "@/components/CoinPicker";
import { computeOutcomes, type Outcome } from "@/lib/outcomes";
import { INTERVALS, ProChart, type Interval, type Market } from "@/components/ProChart";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { num, pct, taipei } from "@/lib/format";
import {
  MARK_COLOR,
  STATUS_LABEL,
  isShown,
  spotOf,
  marketType,
  MARKET_LABEL,
  ALL_PERPS,
  type MarketType,
  fromBacktest,
  fromLive,
  type BacktestRow,
  type Burst,
  type LiveRow,
  type SignalStatus,
} from "@/lib/research";

const POLL_MS = 30_000;
const PAGE = 50;

type Tab = "signals" | "counts";
type Sort = { key: string; dir: 1 | -1 };
type CoinCount = {
  s: string;
  mt: MarketType | null;
  passed: number;
  pending: number;
  total: number;
  lastMs: number;
  avg4h: number | null;
  med4h: number | null;
};
const MT_SORT = (s: string) => (marketType(s) === "both" ? 0 : marketType(s) === "perp" ? 1 : 2);

const SIGNAL_SORT: Record<string, (r: Burst) => number | string | null | undefined> = {
  time: (r) => r.closeMs,
  symbol: (r) => r.symbol,
  close: (r) => r.close,
  ret: (r) => r.ret,
  rvol: (r) => r.rvol,
  taker: (r) => r.taker,
  oi: (r) => r.oiChg,
  p: (r) => r.obsP,
  status: (r) => STATUS_LABEL[r.status],
  a1: (r) => r.out?.a1, u1: (r) => r.out?.u1, d1: (r) => r.out?.d1,
  a4: (r) => r.out?.a4, u4: (r) => r.out?.u4, d4: (r) => r.out?.d4,
  tg: (r) => (r.telegram ? 1 : 0),
  src: (r) => (r.source === "live" ? "線上" : "回測"),
  mt: (r) => MT_SORT(r.symbol),
};
const ordKey = (r: Burst) => `${r.symbol}|${r.closeMs}`;
const COUNT_SORT: Record<string, (r: CoinCount) => number | string | null> = {
  symbol: (r) => r.s,
  mt: (r) => MT_SORT(r.s),
  passed: (r) => r.passed,
  pending: (r) => r.pending,
  total: (r) => r.total,
  last: (r) => r.lastMs,
  avg4h: (r) => r.avg4h,
  med4h: (r) => r.med4h,
};

/** Stable sort; empty values always go last. */
function sortBy<T>(xs: T[], get: (x: T) => number | string | null | undefined, dir: 1 | -1): T[] {
  return xs
    .map((x, i) => ({ x, i, v: get(x) }))
    .sort((a, b) => {
      const ae = a.v == null || (typeof a.v === "number" && Number.isNaN(a.v));
      const be = b.v == null || (typeof b.v === "number" && Number.isNaN(b.v));
      if (ae || be) return ae && be ? a.i - b.i : ae ? 1 : -1;
      const c = typeof a.v === "string" ? a.v.localeCompare(b.v as string, "zh-Hant") : (a.v as number) - (b.v as number);
      return c === 0 ? a.i - b.i : c * dir;
    })
    .map((o) => o.x);
}

const OUT_TIP = "從警報時間（判斷 K 收盤＝爆量收盤＋15 分）的合約 5 分 K 收盤價起算，和整體回測相同；最大漲幅／跌幅用窗內 5 分 K 的最高／最低價。窗還沒走完的顯示目前數字並標「進行中」。";

function OutCells({ o }: { o?: Outcome }) {
  const cell = (v: number | null | undefined, f: boolean | undefined, k: string) => (
    <td key={k} className={cls(v)} style={{ whiteSpace: "nowrap" }} title={v != null && !f ? "進行中：窗還沒走完" : undefined}>
      {pct(v ?? null)}
      {v != null && !f ? <span className="sym"> 進行中</span> : null}
    </td>
  );
  return (
    <>
      {cell(o?.a1, o?.f1, "a1")}
      {cell(o?.u1, o?.f1, "u1")}
      {cell(o?.d1, o?.f1, "d1")}
      {cell(o?.a4, o?.f4, "a4")}
      {cell(o?.u4, o?.f4, "u4")}
      {cell(o?.d4, o?.f4, "d4")}
    </>
  );
}

function SortTh({ k, label, sort, onSort, num: numeric = true, title }: { k: string; label: string; sort: Sort; onSort: (k: string, numeric: boolean) => void; num?: boolean; title?: string }) {
  const on = sort.key === k;
  return (
    <th title={title} className={`sortable${on ? " on" : ""}`} onClick={() => onSort(k, numeric)} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      {label}
      <span className="sort-ind">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}
type StatusFilter = "all" | SignalStatus;

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

function cls(x: number | null | undefined) {
  if (x == null || Number.isNaN(x)) return "";
  return x > 0 ? "up" : x < 0 ? "dn" : "";
}

const latest = (xs: Burst[]) => xs.reduce<Burst | null>((a, b) => (!a || b.closeMs > a.closeMs ? b : a), null);
const short = (ms: number) => taipei(new Date(ms).toISOString()).replace(/:00 台北$/, "").replace(" 台北", "");

export function ResearchBoard() {
  const [tab, setTab] = useState<Tab>("signals");
  const [live, setLive] = useState<Burst[] | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [bt, setBt] = useState<Burst[] | null>(null);
  const [btErr, setBtErr] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [listCoin, setListCoin] = useState(""); // "" = all coins
  const [chartCoin, setChartCoin] = useState<string | null>(null);
  const [focusMs, setFocusMs] = useState<number | null>(null);
  const [iv, setIv] = useState<Interval>("5m");
  const [mkt, setMkt] = useState<Market>("futures");
  const [urlReady, setUrlReady] = useState(false);
  const [allMode, setAllMode] = useState(false);
  const [sigSort, setSigSort] = useState<Sort>({ key: "time", dir: -1 });
  const [cntSort, setCntSort] = useState<Sort>({ key: "total", dir: -1 });
  const [cntScope, setCntScope] = useState<"signals" | "all">("signals");
  const [cntMt, setCntMt] = useState<"" | MarketType>("");

  // Shareable state: ?coin=GTCUSDT&iv=5m&mkt=futures&t=<burst close ms>&list=all
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = (q.get("coin") || "").toUpperCase();
    if (/^[A-Z0-9]{2,30}USDT$/.test(c)) {
      setChartCoin(c);
      if (q.get("list") !== "all") setListCoin(c);
    }
    const ivq = q.get("iv");
    if (INTERVALS.some((x) => x.key === ivq)) setIv(ivq as Interval);
    if (q.get("mkt") === "spot") setMkt("spot");
    if (q.get("view") === "all") {
      setAllMode(true);
      setListCoin("");
    }
    const tab0 = q.get("tab");
    if (tab0 === "counts") setTab("counts");
    const tq = Number(q.get("t"));
    if (Number.isFinite(tq) && tq > 1.6e12) setFocusMs(tq);
    setUrlReady(true);
  }, []);
  const [page, setPage] = useState(0);
  const chartRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const rows = await rpc<LiveRow[]>("dashboard_research_signals");
        if (!dead) {
          setLive((rows || []).filter((r) => isShown(r.status)).map(fromLive));
          setLiveErr(null);
        }
      } catch (e) {
        if (!dead) {
          setLive((x) => x ?? []);
          setLiveErr(e instanceof Error && e.message === "404" ? "線上訊號表還沒建立。" : "線上訊號暫時讀不到。");
        }
      }
    };
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    fetch("/data/research_backtest.json")
      .then((r) => r.json())
      .then((j: { rows: BacktestRow[] }) => setBt(j.rows.filter((r) => isShown(r.st)).map(fromBacktest)))
      .catch(() => {
        setBt([]);
        setBtErr("回測資料讀不到。");
      });
  }, []);

  // 1h / 4h outcomes for rows the backtest file has not finished (live rows, recent backtest rows).
  const [outs, setOuts] = useState<Map<string, Outcome>>(new Map());
  const outTick = useRef(0);
  const [outClock, setOutClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setOutClock((x) => x + 1), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  const needKey = useMemo(() => {
    const xs = [...(bt || []), ...(live || [])].filter((r) => !(r.out?.f1 && r.out?.f4) && Date.now() - r.closeMs < 30 * 86400_000);
    return JSON.stringify(xs.map((r) => [r.key, r.symbol, r.closeMs]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bt, live, outClock]);
  useEffect(() => {
    const items = JSON.parse(needKey) as [string, string, number][];
    const todo = items.filter(([k]) => !(outs.get(k)?.f1 && outs.get(k)?.f4));
    if (!todo.length) return;
    const tick = ++outTick.current;
    computeOutcomes(todo).then((m) => {
      if (tick !== outTick.current) return;
      setOuts((prev) => {
        const n = new Map(prev);
        for (const [k, v] of m) n.set(k, v);
        return n;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needKey]);
  const withOut = useCallback((r: Burst): Burst => {
    if (r.out?.f1 && r.out?.f4) return r;
    const o = outs.get(r.key);
    return o ? { ...r, out: o } : r;
  }, [outs]);

  // Every signal per coin (live wins over a backtest row at the same bar).
  const byCoin = useMemo(() => {
    const m = new Map<string, Map<number, Burst>>();
    for (const r0 of [...(bt || []), ...(live || [])]) {
      const r = withOut(r0);
      const mm = m.get(r.symbol) ?? new Map<number, Burst>();
      mm.set(r.closeMs, r);
      m.set(r.symbol, mm);
    }
    return m;
  }, [live, bt, withOut]);
  const coins: CoinInfo[] = useMemo(() => {
    const liveSet = new Set((live || []).map((r) => r.symbol));
    return [...byCoin.entries()].map(([s, m]) => ({
      s,
      n: m.size,
      live: liveSet.has(s),
      lastMs: Math.max(...m.keys()),
    }));
  }, [byCoin, live]);

  // Default chart: latest live passed -> latest live of any status -> latest backtest.
  const fallback = useMemo(() => {
    const l = live || [];
    return latest(l.filter((r) => r.status === "passed")) ?? latest(l) ?? latest(bt || []);
  }, [live, bt]);
  const ready = live != null && bt != null;
  const coin = chartCoin ?? fallback?.symbol ?? null;
  const coinSignals = useMemo(
    () => (coin ? [...(byCoin.get(coin)?.values() ?? [])].sort((a, b) => a.closeMs - b.closeMs) : []),
    [coin, byCoin],
  );
  const focus =
    focusMs ??
    (chartCoin == null && fallback ? fallback.closeMs : null) ??
    latest(coinSignals.filter((r) => r.source === "live"))?.closeMs ??
    latest(coinSignals)?.closeMs ??
    null;
  const focusIdx = coinSignals.findIndex((r) => r.closeMs === focus);
  const focused = focusIdx >= 0 ? coinSignals[focusIdx] : null;
  const spotSymbol = coin ? spotOf(coin, coinSignals.find((r) => r.spotSymbol)?.spotSymbol) : "";

  useEffect(() => {
    if (!urlReady || (!coin && !allMode)) return;
    const q = new URLSearchParams();
    if (allMode) {
      q.set("view", "all");
    } else if (coin) {
      q.set("coin", coin);
      if (iv !== "5m") q.set("iv", iv);
      if (mkt !== "futures") q.set("mkt", mkt);
      if (focus != null) q.set("t", String(focus));
      if (!listCoin) q.set("list", "all");
    }
    if (tab !== "signals") q.set("tab", tab);
    const url = `${window.location.pathname}?${q.toString()}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
  }, [urlReady, coin, iv, mkt, focus, listCoin, allMode, tab]);

  const pickCoin = (s: string) => {
    if (!s) {
      setListCoin("");
    } else {
      setAllMode(false);
      setListCoin(s);
      setChartCoin(s);
      setFocusMs(null);
    }
    setPage(0);
  };
  const enterAll = () => {
    setAllMode(true);
    setListCoin("");
    setPage(0);
  };
  const openCoin = (s: string) => {
    pickCoin(s);
    if (tab === "counts") setTab("signals");
    setTimeout(() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const toggleSort = (set: (f: (s: Sort) => Sort) => void) => (k: string, numeric: boolean) => {
    set((s) => (s.key === k ? { key: k, dir: (s.dir * -1) as 1 | -1 } : { key: k, dir: numeric ? -1 : 1 }));
    setPage(0);
  };
  const onFocus = useCallback((ms: number) => setFocusMs(ms), []);
  const jump = (r: Burst) => {
    setAllMode(false);
    setChartCoin(r.symbol);
    setFocusMs(r.closeMs);
    setTimeout(() => chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  // One merged list: backtest + live, deduped on (symbol, bar close), live row wins (see byCoin).
  const merged = useMemo(() => (live == null && bt == null ? null : [...byCoin.values()].flatMap((m) => [...m.values()])), [byCoin, live, bt]);
  const rows = tab === "signals" ? merged : null;
  // Per-coin ordinal over the merged list, chronological from 1.
  const ordinals = useMemo(() => {
    const m = new Map<string, { n: number; of: number }>();
    for (const [sym, mm] of byCoin) {
      const ts = [...mm.keys()].sort((a, b) => a - b);
      ts.forEach((t, i) => m.set(`${sym}|${t}`, { n: i + 1, of: ts.length }));
    }
    return m;
  }, [byCoin]);
  const sigSortFn = (k: string) => (k === "ord" ? (r: Burst) => ordinals.get(ordKey(r))?.n : SIGNAL_SORT[k] ?? SIGNAL_SORT.time);

  const filtered = useMemo(() => {
    const xs = (rows || []).filter((r) => (status === "all" || r.status === status) && (!listCoin || r.symbol === listCoin));
    return sortBy(xs, sigSortFn(sigSort.key), sigSort.dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, status, listCoin, sigSort, ordinals]);

  // Per-coin counts over the merged list (failed rows are excluded at the source).
  const allCounts: CoinCount[] = useMemo(() => {
    const out: CoinCount[] = [];
    const seen = new Set<string>();
    for (const [s, mm] of byCoin) {
      seen.add(s);
      const xs = [...mm.values()];
      const r = xs.filter((x) => x.status === "passed" && x.out?.f4 && x.out.a4 != null).map((x) => x.out!.a4 as number).sort((a, b) => a - b);
      out.push({
        s,
        mt: marketType(s),
        passed: xs.filter((x) => x.status === "passed").length,
        pending: xs.filter((x) => x.status === "pending").length,
        total: xs.length,
        lastMs: Math.max(...mm.keys()),
        avg4h: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
        med4h: r.length ? r[Math.floor(r.length / 2)] : null,
      });
    }
    for (const s of ALL_PERPS) if (!seen.has(s)) out.push({ s, mt: marketType(s), passed: 0, pending: 0, total: 0, lastMs: 0, avg4h: null, med4h: null });
    return out;
  }, [byCoin]);
  const counts = useMemo(
    () =>
      sortBy(
        allCounts.filter((c) => (cntScope === "all" || c.total > 0) && (!cntMt || c.mt === cntMt)),
        COUNT_SORT[cntSort.key] ?? COUNT_SORT.total,
        cntSort.dir,
      ),
    [allCounts, cntScope, cntMt, cntSort],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const stats = useMemo(() => {
    const all = (rows || []).filter((r) => !listCoin || r.symbol === listCoin);
    const passed = all.filter((r) => r.status === "passed");
    const withR = passed.filter((r) => r.out?.f4).map((r) => r.out!.a4).filter((x): x is number => x != null);
    const up = withR.filter((x) => x > 0).length;
    const sorted = [...withR].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return { total: all.length, passed: passed.length, pending: all.filter((r) => r.status === "pending").length, live: all.filter((r) => r.source === "live").length, symbols: new Set(all.map((r) => r.symbol)).size, up, n4h: withR.length, med };
  }, [rows, listCoin]);
  const err = [liveErr, btErr].filter(Boolean).join(" ") || null;
  const onSigSort = toggleSort(setSigSort);
  const onCntSort = toggleSort(setCntSort);

  return (
    <div className="explorer">
      <section ref={chartRef} className="signal-chart">
        <div className="toolbar">
          <div className="chart-title">
            <div className="seg" role="group" aria-label="顯示模式">
              <button className={!allMode ? "on" : ""} onClick={() => { if (coin) pickCoin(coin); }}>單一幣別</button>
              <button className={allMode ? "on" : ""} onClick={enterAll}>全部幣別</button>
            </div>
            <CoinPicker coins={coins} value={allMode ? null : coin} onPick={pickCoin} />
            {allMode ? (
              <span className="note">全部幣別：不顯示 K 線，只看表格；選一個幣別就會回到 K 線。</span>
            ) : coin && focused ? (
              <span>
                爆量收盤 {short(focused.closeMs)} ·{" "}
                <b style={{ color: MARK_COLOR[focused.status] }}>{STATUS_LABEL[focused.status]}</b>
                {focused.source === "live" ? " · 線上" : " · 回測"}
                {chartCoin == null ? "（最新訊號）" : ""}
              </span>
            ) : !coin ? (
              <span className="note">{ready ? "還沒有訊號。" : "載入中…"}</span>
            ) : null}
          </div>
          <div className="toolbar-actions" hidden={allMode}>
            <button className="btn sm" disabled={focusIdx <= 0} onClick={() => setFocusMs(coinSignals[focusIdx - 1].closeMs)}>← 上一個訊號</button>
            <button className="btn sm" disabled={focusIdx < 0 || focusIdx + 1 >= coinSignals.length} onClick={() => setFocusMs(coinSignals[focusIdx + 1].closeMs)}>下一個訊號 →</button>
          </div>
        </div>
        {allMode ? null : coin && urlReady ? (
          <ProChart
            symbol={coin}
            spotSymbol={spotSymbol}
            signals={coinSignals}
            focusMs={focus}
            interval={iv}
            market={mkt}
            onInterval={setIv}
            onMarket={setMkt}
            onFocus={onFocus}
          />
        ) : (
          <div className="pro-chart"><div className="pc-stage"><div className="pc-skeleton"><div className="sk-bars">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ height: `${20 + ((i * 37) % 55)}%` }} />)}</div><span>{ready ? "沒有可顯示的訊號" : "載入中…"}</span></div></div></div>
        )}
      </section>

      <div className="toolbar">
        <div className="seg">
          <button className={tab === "signals" ? "on" : ""} onClick={() => { setTab("signals"); setPage(0); }}>訊號列表</button>
          <button className={tab === "counts" ? "on" : ""} onClick={() => { setTab("counts"); setPage(0); }}>各幣訊號次數</button>
        </div>
        {tab === "counts" ? (
          <div className="toolbar-actions">
            <label className="field inline">
              幣別範圍
              <select value={cntScope} onChange={(e) => { setCntScope(e.target.value as "signals" | "all"); setPage(0); }}>
                <option value="signals">有訊號的幣</option>
                <option value="all">全部幣（含 0 次）</option>
              </select>
            </label>
            <label className="field inline">
              市場
              <select value={cntMt} onChange={(e) => { setCntMt(e.target.value as "" | MarketType); setPage(0); }}>
                <option value="">全部</option>
                <option value="both">現貨＋合約</option>
                <option value="perp">只有合約</option>
              </select>
            </label>
          </div>
        ) : null}
        <div className="toolbar-actions" hidden={tab === "counts"}>
          <label className="field inline">
            狀態
            <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }}>
              <option value="all">全部（通過＋觀察中）</option>
              <option value="passed">通過（發 Telegram）</option>
              <option value="pending">觀察中</option>
              <option value="error">資料不足</option>
            </select>
          </label>
          <div className="seg">
            <button className={!listCoin ? "on" : ""} onClick={() => { setListCoin(""); setPage(0); }}>全部幣別</button>
            <button className={listCoin ? "on" : ""} disabled={!coin || allMode} onClick={() => { if (coin) { setListCoin(coin); setPage(0); } }}>只看 {coin && !allMode ? coin.replace(/USDT$/, "") : "—"}</button>
          </div>
        </div>
      </div>

      {tab === "counts" ? (
        <div className="cards" style={{ margin: "10px 0 14px" }}>
          <div className="card"><b>{num(allCounts.filter((c) => c.total > 0).length)}</b><span>有訊號的幣</span><em>不含只有未過的幣</em></div>
          <div className="card"><b>{num(allCounts.reduce((a, c) => a + c.total, 0))}</b><span>訊號合計</span><em>通過 {num(allCounts.reduce((a, c) => a + c.passed, 0))} · 觀察中 {num(allCounts.reduce((a, c) => a + c.pending, 0))}</em></div>
          <div className="card"><b>{num(allCounts.filter((c) => c.mt === "both").length)}</b><span>現貨＋合約</span><em>{num(allCounts.filter((c) => c.mt === "both" && c.total > 0).length)} 個有訊號</em></div>
          <div className="card"><b>{num(allCounts.filter((c) => c.mt === "perp").length)}</b><span>只有合約</span><em>{num(allCounts.filter((c) => c.mt === "perp" && c.total > 0).length)} 個有訊號 · 規則需要現貨資料</em></div>
        </div>
      ) : (
      <div className="cards" style={{ margin: "10px 0 14px" }}>
        <div className="card"><b>{num(stats.total)}</b><span>訊號（通過＋觀察中）</span><em>{num(stats.symbols)} 個幣 · 不含未過</em></div>
        <div className="card"><b>{num(stats.passed)}</b><span>第二層通過</span><em>會發 Telegram · 觀察中 {num(stats.pending)}</em></div>
        <div className="card"><b>{stats.n4h ? `${Math.round((stats.up / stats.n4h) * 100)}%` : "—"}</b><span>通過後 4 小時上漲</span><em>{num(stats.n4h)} 筆 4h 已走完 · 從警報時間起算</em></div>
        <div className="card"><b className={cls(stats.med)}>{pct(stats.med)}</b><span>通過後 4 小時中位數</span><em>只作對照</em></div>
      </div>
      )}

      {err ? <p className="err">{err}</p> : null}
      {tab !== "counts" && rows == null && !err ? <p className="note">載入中…</p> : null}

      {tab === "counts" ? (
        live == null || bt == null ? (
          <p className="note">載入中…</p>
        ) : (
          <>
            <div className="scroll">
              <table className="counts-table">
                <thead>
                  <tr>
                    <SortTh k="symbol" label="幣別" sort={cntSort} onSort={onCntSort} num={false} />
                    <SortTh k="mt" label="市場" sort={cntSort} onSort={onCntSort} num={false} />
                    <SortTh k="total" label="訊號次數" sort={cntSort} onSort={onCntSort} />
                    <SortTh k="passed" label="通過" sort={cntSort} onSort={onCntSort} />
                    <SortTh k="pending" label="觀察中" sort={cntSort} onSort={onCntSort} />
                    <SortTh k="last" label="最新訊號（台北）" sort={cntSort} onSort={onCntSort} />
                    <SortTh k="avg4h" label="事後 4h 平均" sort={cntSort} onSort={onCntSort} />
                    <SortTh k="med4h" label="事後 4h 中位數" sort={cntSort} onSort={onCntSort} />
                  </tr>
                </thead>
                <tbody>
                  {counts.slice(page * PAGE, page * PAGE + PAGE).map((c) => (
                    <tr key={c.s} onClick={c.total ? () => openCoin(c.s) : undefined} style={{ cursor: c.total ? "pointer" : "default" }} title={c.total ? "在 K 線圖打開" : "沒有訊號"}>
                      <td><b>{c.s.replace(/USDT$/, "")}</b><span className="sym">USDT</span></td>
                      <td>{c.mt ? <span className={`mt-tag ${c.mt}`}>{MARKET_LABEL[c.mt]}</span> : "—"}</td>
                      <td><b>{c.total}</b></td>
                      <td>{c.passed || "—"}</td>
                      <td>{c.pending || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{c.lastMs ? short(c.lastMs) : "—"}</td>
                      <td className={cls(c.avg4h)}>{pct(c.avg4h)}</td>
                      <td className={cls(c.med4h)}>{pct(c.med4h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>上一頁</button>
              <span className="note">第 {page + 1} / {Math.max(1, Math.ceil(counts.length / PAGE))} 頁，共 {num(counts.length)} 個幣 · 點有訊號的幣打開 K 線</span>
              <button className="btn" disabled={page + 1 >= Math.ceil(counts.length / PAGE)} onClick={() => setPage((p) => p + 1)}>下一頁</button>
            </div>
          </>
        )
      ) : null}

      {rows ? (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <SortTh k="time" label="爆量收盤（台北）" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="symbol" label="幣別" sort={sigSort} onSort={onSigSort} num={false} />
                  <SortTh k="mt" label="市場" sort={sigSort} onSort={onSigSort} num={false} />
                  <SortTh k="ord" label="該幣第幾筆" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="close" label="收盤價" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="ret" label="漲幅" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="rvol" label="相對量" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="taker" label="主動買賣比" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="oi" label="未平倉變化" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="a1" label="1h 漲跌" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="u1" label="1h 內最大漲幅" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="d1" label="1h 內最大跌幅" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="a4" label="4h 漲跌" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="u4" label="4h 內最大漲幅" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="d4" label="4h 內最大跌幅" title={OUT_TIP} sort={sigSort} onSort={onSigSort} />
                  <SortTh k="tg" label="Telegram" sort={sigSort} onSort={onSigSort} />
                  <SortTh k="src" label="來源" sort={sigSort} onSort={onSigSort} num={false} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => jump(r)}
                    style={{ cursor: "pointer" }}
                    className={r.symbol === coin && r.closeMs === focus ? "on" : ""}
                  >
                    <td style={{ whiteSpace: "nowrap" }}>{short(r.closeMs)}</td>
                    <td>{r.symbol}{r.status !== "passed" ? <span className={`st-tag ${r.status}`} title={r.reason || ""}>{STATUS_LABEL[r.status]}</span> : null}</td>
                    <td>{(() => { const mt = marketType(r.symbol); return mt ? <span className={`mt-tag ${mt}`}>{MARKET_LABEL[mt]}</span> : "—"; })()}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{(() => { const o = ordinals.get(ordKey(r)); return o ? <><b>{o.n}</b><span className="sym"> / {o.of}</span></> : "—"; })()}</td>
                    <td>{r.close == null ? "—" : r.close.toPrecision(6)}</td>
                    <td className={cls(r.ret)}>{pct(r.ret)}</td>
                    <td>{r.rvol == null ? "—" : r.rvol.toFixed(1)}</td>
                    <td>{r.taker == null ? "—" : r.taker.toFixed(3)}</td>
                    <td className={cls(r.oiChg)}>{pct(r.oiChg)}</td>
                    <OutCells o={r.out} />
                    <td>{r.telegram ? "已送" : "—"}</td>
                    <td className="sym">{r.source === "live" ? "線上" : "回測"}</td>
                  </tr>
                ))}
                {shown.length === 0 ? (
                  <tr><td colSpan={17} className="note">沒有符合的訊號。</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>上一頁</button>
            <span className="note">第 {page + 1} / {pages} 頁，共 {num(filtered.length)} 筆</span>
            <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>下一頁</button>
          </div>
        </>
      ) : null}
    </div>
  );
}
