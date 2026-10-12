"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProChart, type ChartPattern, type Interval, type Market } from "@/components/ProChart";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { num, pct, taipei } from "@/lib/format";
import { spotOf } from "@/lib/research";
import { compactUsd, px, sec, type DbRow, type DbSnapshot, type DbStatus } from "@/lib/doubleBottom";

const POLL_MS = 60_000;
type Sort = { key: string; dir: 1 | -1 };
type MktFilter = "" | "現貨＋合約" | "只有合約";

const SORT: Record<string, (r: DbRow) => number | string | null | undefined> = {
  symbol: (r) => r.symbol,
  market: (r) => (r.market === "現貨＋合約" ? 0 : 1),
  l1: (r) => sec(r.l1_time),
  h: (r) => sec(r.h_time),
  l2: (r) => sec(r.l2_time),
  brk: (r) => sec(r.breakout_time),
  price: (r) => r.price,
  dist: (r) => r.dist_neck,
  vr: (r) => r.vol_ratio,
  div: (r) => (r.rsi_div ? 1 : 0),
  oi1: (r) => r.oi_l1_l2,
  oi2: (r) => r.oi_l2_now,
  q24: (r) => r.quote_24h,
  score: (r) => r.score,
  age: (r) => r.l2_age_h,
};

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

function SortTh({ k, label, sort, onSort, title, numeric = true }: { k: string; label: string; sort: Sort; onSort: (k: string, numeric: boolean) => void; title?: string; numeric?: boolean }) {
  const on = sort.key === k;
  return (
    <th title={title} className={`sortable${on ? " on" : ""}`} onClick={() => onSort(k, numeric)} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      {label}
      <span className="sort-ind">{on ? (sort.dir === 1 ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}

const cls = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? "" : x > 0 ? "up" : x < 0 ? "dn" : "");
/** "10-11 18:30" in Taipei. */
const hm = (iso: string | null | undefined) => (iso ? taipei(iso).replace(/^\d{4}\//, "").replace(/:\d{2} 台北$/, "").replace("/", "-") : "—");

function ago(iso: string | undefined, now: number) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分鐘前` : `${Math.floor(m / 60)} 小時 ${m % 60} 分前`;
}

function patternOf(r: DbRow): ChartPattern {
  return {
    l1: sec(r.l1_time)!, l1p: r.l1_price,
    h: sec(r.h_time)!, hp: r.h_price,
    l2: sec(r.l2_time)!, l2p: r.l2_price,
    brk: r.breakout_time ? sec(r.breakout_time)! - 900 : null,
  };
}

export function DoubleBottomBoard() {
  const [snap, setSnap] = useState<DbSnapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<DbStatus>("已突破");
  const [mkt, setMkt] = useState<MktFilter>("");
  const [sorts, setSorts] = useState<Record<DbStatus, Sort>>({ 已突破: { key: "score", dir: -1 }, 形成中: { key: "score", dir: -1 } });
  const [pick, setPick] = useState<string | null>(null);
  const [iv, setIv] = useState<Interval>("15m");
  const [chartMkt, setChartMkt] = useState<Market>("futures");
  const [now, setNow] = useState(() => Date.now());
  const chartRef = useRef<HTMLElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_double_bottom`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`讀取失敗 ${res.status}`);
      const j = (await res.json()) as DbSnapshot;
      setSnap((prev) => (prev?.scanned_at === j.scanned_at && prev ? prev : j));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "讀取失敗");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      setNow(Date.now());
      if (!document.hidden) void load();
    }, POLL_MS);
    const vis = () => {
      if (!document.hidden) {
        setNow(Date.now());
        void load();
      }
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [load]);

  const rows = useMemo(() => snap?.rows ?? [], [snap]);
  const counts = useMemo(() => {
    const f = (st: DbStatus) => rows.filter((r) => r.status === st && (!mkt || r.market === mkt)).length;
    return { 已突破: f("已突破"), 形成中: f("形成中") };
  }, [rows, mkt]);
  const sort = sorts[tab];
  const list = useMemo(
    () => sortBy(rows.filter((r) => r.status === tab && (!mkt || r.market === mkt)), SORT[sort.key] ?? SORT.score, sort.dir),
    [rows, tab, mkt, sort],
  );
  const onSort = (k: string, numeric: boolean) =>
    setSorts((s) => ({ ...s, [tab]: s[tab].key === k ? { key: k, dir: (s[tab].dir * -1) as 1 | -1 } : { key: k, dir: numeric ? -1 : 1 } }));

  // Chart: the picked coin, else the top row of the current tab.
  const sel = useMemo(() => rows.find((r) => r.symbol === pick) ?? list[0] ?? null, [rows, pick, list]);
  const pattern = useMemo(() => (sel ? patternOf(sel) : null), [sel]);
  const open = (r: DbRow) => {
    setPick(r.symbol);
    if (iv !== "15m") setIv("15m");
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nextScan = snap?.bar_close ? Date.parse(snap.bar_close) + 15 * 60_000 + 90_000 : null;
  const stale = snap?.scanned_at ? now - Date.parse(snap.scanned_at) > 35 * 60_000 : false;
  const brkTab = tab === "已突破";

  return (
    <div className="explorer db-board">
      <section ref={chartRef} className="signal-chart">
        <div className="toolbar">
          <div className="chart-title">
            {sel ? (
              <span>
                <b>{sel.symbol.replace(/USDT$/, "")}</b><span className="sym">USDT</span>
                {" · "}<span className={`db-tag ${sel.status === "已突破" ? "brk" : "form"}`}>{sel.status}</span>
                {sel.fell_back ? <span className="db-tag back">跌回頸線下</span> : null}
                {" · 頸線 "}{px(sel.h_price)}{" · 分數 "}<b>{sel.score?.toFixed(1)}</b>
                {pick == null ? <span className="note">（{tab}分數最高）</span> : null}
              </span>
            ) : (
              <span className="note">{snap ? "目前沒有偵測到的形態。" : "載入中…"}</span>
            )}
          </div>
          <div className="toolbar-actions db-legend">
            <span><i style={{ background: "#4fa3ff" }} />L1 / L2</span>
            <span><i style={{ background: "#e4b15a" }} />H、頸線</span>
            <span><i style={{ background: "#3cbe88" }} />突破</span>
          </div>
        </div>
        {sel ? (
          <ProChart
            key={sel.symbol}
            symbol={sel.symbol}
            spotSymbol={spotOf(sel.symbol)}
            signals={[]}
            focusMs={null}
            interval={iv}
            market={chartMkt}
            onInterval={setIv}
            onMarket={setChartMkt}
            pattern={pattern}
          />
        ) : (
          <div className="pro-chart"><div className="pc-stage"><div className="pc-skeleton"><div className="sk-bars">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ height: `${20 + ((i * 37) % 55)}%` }} />)}</div><span>{snap ? "沒有可顯示的形態" : "載入中…"}</span></div></div></div>
        )}
      </section>

      <div className="db-status">
        {snap?.scanned_at ? (
          <>
            <span className={stale ? "err" : ""}>
              更新於 <b>{taipei(snap.scanned_at).replace(/^\d{4}\//, "")}</b>（{ago(snap.scanned_at, now)}）· 資料到 15 分 K {hm(snap.bar_close)} 收盤
            </span>
            <span className="note">
              {nextScan ? `下次掃描約 ${hm(new Date(nextScan).toISOString())}` : ""} · 頁面每分鐘自動更新 · 掃描 {num(snap.coins)} 幣，24h 成交額不足 2M USDT 剔除 {num(snap.low_liquidity)} 個
              {stale ? " · 超過 35 分鐘沒有新掃描，worker 可能暫停中" : ""}
            </span>
          </>
        ) : (
          <span className="note">{err ?? "載入中…"}</span>
        )}
      </div>

      <div className="toolbar">
        <div className="seg">
          <button className={tab === "已突破" ? "on" : ""} onClick={() => setTab("已突破")}>已突破 <span className="sym">{counts.已突破}</span></button>
          <button className={tab === "形成中" ? "on" : ""} onClick={() => setTab("形成中")}>形成中 <span className="sym">{counts.形成中}</span></button>
        </div>
        <div className="toolbar-actions">
          <label className="field inline">
            市場
            <select value={mkt} onChange={(e) => setMkt(e.target.value as MktFilter)}>
              <option value="">全部</option>
              <option value="現貨＋合約">現貨＋合約</option>
              <option value="只有合約">只有合約</option>
            </select>
          </label>
        </div>
      </div>

      {err && snap ? <p className="err">{err}</p> : null}

      <div className="scroll">
        <table className="db-table">
          <thead>
            <tr>
              <SortTh k="symbol" label="幣別" sort={sort} onSort={onSort} numeric={false} />
              <SortTh k="market" label="市場" sort={sort} onSort={onSort} numeric={false} />
              <SortTh k="l1" label="L1 時間／價" sort={sort} onSort={onSort} title="第一個底（15 分 K 開盤時間，台北）" />
              <SortTh k="h" label="H 頸線" sort={sort} onSort={onSort} title="兩底之間的最高價" />
              <SortTh k="l2" label="L2 時間／價" sort={sort} onSort={onSort} title="第二個底；「暫定」表示最後 3 根內的低點、還不是完整樞紐" />
              {brkTab ? <SortTh k="brk" label="突破時間" sort={sort} onSort={onSort} title="第一根收盤高於頸線的 15 分 K 收盤時間" /> : null}
              <SortTh k="price" label="現價" sort={sort} onSort={onSort} title="最新已收盤 1 分 K 收盤價（合約）" />
              <SortTh k="dist" label="距頸線" sort={sort} onSort={onSort} title="現價 ÷ 頸線 − 1" />
              <SortTh k="vr" label="量比" sort={sort} onSort={onSort} title="L2 量 ÷ L1 量（各取前後 2 根，用幣數）；< 1 表示第二底量縮" />
              <SortTh k="div" label="RSI 背離" sort={sort} onSort={onSort} title="L2 不高於 L1＋0.25 ATR，但 RSI(14) 高 3 以上" />
              <SortTh k="oi1" label="OI L1→L2" sort={sort} onSort={onSort} title="未平倉量變化，只列出、不計分" />
              <SortTh k="oi2" label="OI L2→今" sort={sort} onSort={onSort} title="未平倉量變化，只列出、不計分" />
              <SortTh k="q24" label="24h 成交額" sort={sort} onSort={onSort} title="USDT，只用來過濾流動性（≥ 2M）" />
              <SortTh k="score" label="分數" sort={sort} onSort={onSort} title="0–100，見下方說明" />
              <SortTh k="age" label="L2 距今" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.symbol} onClick={() => open(r)} className={sel?.symbol === r.symbol ? "on" : ""} style={{ cursor: "pointer" }} title="在上方 K 線打開">
                <td style={{ whiteSpace: "nowrap" }}>
                  <b>{r.symbol.replace(/USDT$/, "")}</b><span className="sym">USDT</span>
                  {r.fell_back ? <span className="db-tag back" title="突破後現價又跌回頸線下（分數已扣 15）">跌回頸線下</span> : null}
                </td>
                <td><span className={`mt-tag ${r.market === "現貨＋合約" ? "both" : "perp"}`}>{r.market}</span></td>
                <td className="tp"><span>{hm(r.l1_time)}</span><b>{px(r.l1_price)}</b></td>
                <td className="tp"><span>{hm(r.h_time)}</span><b>{px(r.h_price)}</b></td>
                <td className="tp"><span>{hm(r.l2_time)}{r.l2_kind === "暫定" ? <em className="db-tag form"> 暫定</em> : null}</span><b>{px(r.l2_price)}</b></td>
                {brkTab ? <td style={{ whiteSpace: "nowrap" }}>{hm(r.breakout_time)}</td> : null}
                <td>{px(r.price)}</td>
                <td className={cls(r.dist_neck)}>{pct(r.dist_neck)}</td>
                <td className={r.vol_ratio != null && r.vol_ratio < 1 ? "up" : ""}>{r.vol_ratio == null ? "—" : r.vol_ratio.toFixed(2)}</td>
                <td>{r.rsi_div ? <b className="up">是</b> : <span className="sym">否</span>}</td>
                <td className={cls(r.oi_l1_l2)}>{pct(r.oi_l1_l2)}</td>
                <td className={cls(r.oi_l2_now)}>{pct(r.oi_l2_now)}</td>
                <td>{compactUsd(r.quote_24h)}</td>
                <td><b>{r.score == null ? "—" : r.score.toFixed(1)}</b></td>
                <td style={{ whiteSpace: "nowrap" }}>{r.l2_age_h == null ? "—" : `${r.l2_age_h.toFixed(1)}h`}</td>
              </tr>
            ))}
            {snap && list.length === 0 ? (
              <tr><td colSpan={brkTab ? 15 : 14} className="note">目前沒有符合的幣。</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section className="db-rules">
        <h2>規則說明</h2>
        <p className="warn">⚠️ 這裡只做<b>形態偵測</b>，不是買進訊號，參數也沒有回測過準確率。雙底只是型態，不代表後面一定會漲；請自行判斷，不構成投資建議。</p>
        <ul>
          <li><b>資料</b>：全部 528 個 USDT 永續的合約 1 分 K（只用已收盤的），重採樣成 15 分 K；只用已收盤的 15 分 K。成交量一律用幣數，成交額只用來過濾流動性。</li>
          <li><b>樞紐低點</b>：左右各 3 根都不比它低。L1 必須是完整樞紐；L2 可以是完整樞紐，或最後 3 根內的暫定低點（後面至少 2 根）。</li>
          <li><b>時間</b>：L1、L2 都在最近 96 根（24 小時）內，相隔 8–80 根（2–20 小時）。</li>
          <li><b>兩底高度</b>：|L2−L1| ≤ max(1×ATR14, 1.5%)，且不超過形態高度的一半；兩底之間不能有更低的低點。</li>
          <li><b>頸線 H</b>：兩底之間的最高價，比較高的底再往上至少 2×ATR14，且至少 1%。</li>
          <li><b>前段下跌</b>：L1 是前 12 小時的最低點；L1 前 24 小時的最高價 ≥ L1×1.04 或 ≥ L1＋3×ATR，而且這段下跌至少和反彈到頸線一樣深。</li>
          <li><b>L2 之後</b>：最低價不能跌破 min(L1,L2) − 1×ATR。</li>
          <li><b>已突破</b>：L2 之後有一根 15 分 K 收盤高於頸線。突破後現價又跌回頸線下，標「跌回頸線下」並扣 15 分。</li>
          <li><b>形成中</b>：還沒突破，且 (a) L2 已完整、現價在 L2 和頸線之間；或 (b) L2 是暫定低點，現價離 L1 在 1 ATR 內，最近 2 根收在 L1−0.5 ATR 之上，其中有紅 K 或長下影線。</li>
          <li><b>一幣一筆</b>：已突破優先，再取 L2 最新的。<b>流動性</b>：近 24 小時成交額低於 2M USDT 的不列出。</li>
          <li><b>分數（0–100）</b>：形態高度 20（4 ATR 滿分）、兩底對稱 15、L2 量縮 15（量比 &lt; 1 滿分，&lt; 1.5 一半）、RSI 底背離 15、前段跌幅 10（10% 滿分）；已突破再加突破 K 相對量 15（3 倍滿分），形成中再加現價接近頸線的程度 15。OI 變化只列出、不計分。</li>
        </ul>
      </section>
    </div>
  );
}
