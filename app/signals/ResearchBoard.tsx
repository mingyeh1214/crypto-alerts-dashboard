"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoinPicker, type CoinInfo } from "@/components/CoinPicker";
import { INTERVALS, ProChart, type Interval, type Market } from "@/components/ProChart";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { num, pct, taipei } from "@/lib/format";
import {
  MARK_COLOR,
  STATUS_LABEL,
  isShown,
  spotOf,
  fromBacktest,
  fromLive,
  type BacktestRow,
  type Burst,
  type LiveRow,
  type SignalStatus,
} from "@/lib/research";

const POLL_MS = 30_000;
const PAGE = 50;

type Tab = "live" | "backtest";
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
  const [tab, setTab] = useState<Tab>("live");
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

  // Every signal per coin (live wins over a backtest row at the same bar).
  const byCoin = useMemo(() => {
    const m = new Map<string, Map<number, Burst>>();
    for (const r of [...(bt || []), ...(live || [])]) {
      const mm = m.get(r.symbol) ?? new Map<number, Burst>();
      mm.set(r.closeMs, r);
      m.set(r.symbol, mm);
    }
    return m;
  }, [live, bt]);
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
    if (!urlReady || !coin) return;
    const q = new URLSearchParams();
    q.set("coin", coin);
    if (iv !== "5m") q.set("iv", iv);
    if (mkt !== "futures") q.set("mkt", mkt);
    if (focus != null) q.set("t", String(focus));
    if (!listCoin) q.set("list", "all");
    const url = `${window.location.pathname}?${q.toString()}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(null, "", url);
  }, [urlReady, coin, iv, mkt, focus, listCoin]);

  const pickCoin = (s: string) => {
    if (!s) {
      setListCoin("");
    } else {
      setListCoin(s);
      setChartCoin(s);
      setFocusMs(null);
    }
    setPage(0);
  };
  const onFocus = useCallback((ms: number) => setFocusMs(ms), []);
  const jump = (r: Burst) => {
    setChartCoin(r.symbol);
    setFocusMs(r.closeMs);
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const rows = tab === "live" ? live : bt;
  const filtered = useMemo(
    () => (rows || []).filter((r) => (status === "all" || r.status === status) && (!listCoin || r.symbol === listCoin)),
    [rows, status, listCoin],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const stats = useMemo(() => {
    const all = (rows || []).filter((r) => !listCoin || r.symbol === listCoin);
    const passed = all.filter((r) => r.status === "passed");
    const withR = passed.map((r) => r.r4h).filter((x): x is number => x != null);
    const up = withR.filter((x) => x > 0).length;
    const sorted = [...withR].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return { total: all.length, passed: passed.length, symbols: new Set(all.map((r) => r.symbol)).size, up, n4h: withR.length, med };
  }, [rows, listCoin]);
  const err = tab === "live" ? liveErr : btErr;

  return (
    <div className="explorer">
      <section ref={chartRef} className="signal-chart">
        <div className="toolbar">
          <div className="chart-title">
            <CoinPicker coins={coins} value={coin} onPick={pickCoin} />
            {coin && focused ? (
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
          <div className="toolbar-actions">
            <button className="btn sm" disabled={focusIdx <= 0} onClick={() => setFocusMs(coinSignals[focusIdx - 1].closeMs)}>← 上一個訊號</button>
            <button className="btn sm" disabled={focusIdx < 0 || focusIdx + 1 >= coinSignals.length} onClick={() => setFocusMs(coinSignals[focusIdx + 1].closeMs)}>下一個訊號 →</button>
          </div>
        </div>
        {coin && urlReady ? (
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
          <button className={tab === "live" ? "on" : ""} onClick={() => { setTab("live"); setPage(0); }}>線上</button>
          <button className={tab === "backtest" ? "on" : ""} onClick={() => { setTab("backtest"); setPage(0); }}>回測（9 月起）</button>
        </div>
        <div className="toolbar-actions">
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
            <button className={listCoin ? "on" : ""} disabled={!coin} onClick={() => { if (coin) { setListCoin(coin); setPage(0); } }}>只看 {coin ? coin.replace(/USDT$/, "") : "—"}</button>
          </div>
        </div>
      </div>

      <div className="cards" style={{ margin: "10px 0 14px" }}>
        <div className="card"><b>{num(stats.total)}</b><span>訊號（通過＋觀察中）</span><em>{num(stats.symbols)} 個幣 · 不含未過</em></div>
        <div className="card"><b>{num(stats.passed)}</b><span>第二層通過</span><em>會發 Telegram</em></div>
        {tab === "backtest" ? (
          <>
            <div className="card"><b>{stats.n4h ? `${Math.round((stats.up / stats.n4h) * 100)}%` : "—"}</b><span>通過後 4 小時上漲</span><em>從爆量收盤價算</em></div>
            <div className="card"><b className={cls(stats.med)}>{pct(stats.med)}</b><span>通過後 4 小時中位數</span><em>只作對照</em></div>
          </>
        ) : null}
      </div>

      {err ? <p className="err">{err}</p> : null}
      {rows == null && !err ? <p className="note">載入中…</p> : null}

      {rows ? (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>爆量收盤（台北）</th>
                  <th>幣別</th>
                  <th>收盤價</th>
                  <th>漲幅</th>
                  <th>相對量</th>
                  <th>主動買賣比</th>
                  <th>未平倉變化</th>
                  <th>觀察窗 p</th>
                  <th>狀態</th>
                  {tab === "backtest" ? <th>事後 4h</th> : <th>Telegram</th>}
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
                    <td>{r.symbol}{r.source === "manual" ? <span className="sym"> 手冊</span> : null}</td>
                    <td>{r.close == null ? "—" : r.close.toPrecision(6)}</td>
                    <td className={cls(r.ret)}>{pct(r.ret)}</td>
                    <td>{r.rvol == null ? "—" : r.rvol.toFixed(1)}</td>
                    <td>{r.taker == null ? "—" : r.taker.toFixed(3)}</td>
                    <td className={cls(r.oiChg)}>{pct(r.oiChg)}</td>
                    <td>{r.obsP == null ? "—" : r.obsP.toFixed(4)}</td>
                    <td title={r.reason || ""} style={{ color: MARK_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</td>
                    {tab === "backtest" ? <td className={cls(r.r4h)}>{pct(r.r4h)}</td> : <td>{r.telegram ? "已送" : "—"}</td>}
                  </tr>
                ))}
                {shown.length === 0 ? (
                  <tr><td colSpan={10} className="note">沒有符合的訊號。</td></tr>
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
