"use client";

import { useEffect, useMemo, useState } from "react";
import { BurstChart } from "@/components/BurstChart";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { num, pct, taipei } from "@/lib/format";
import {
  STATUS_LABEL,
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

export function ResearchBoard() {
  const [tab, setTab] = useState<Tab>("live");
  const [live, setLive] = useState<Burst[] | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [bt, setBt] = useState<Burst[] | null>(null);
  const [btErr, setBtErr] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("passed");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Burst | null>(null);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const rows = await rpc<LiveRow[]>("dashboard_research_signals");
        if (!dead) {
          setLive((rows || []).map(fromLive));
          setLiveErr(null);
        }
      } catch (e) {
        if (!dead) setLiveErr(e instanceof Error && e.message === "404" ? "線上訊號表還沒建立（等 worker 上線）。" : "線上訊號暫時讀不到。");
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
    if (tab !== "backtest" || bt) return;
    fetch("/data/research_backtest.json")
      .then((r) => r.json())
      .then((j: { rows: BacktestRow[] }) => setBt(j.rows.map(fromBacktest)))
      .catch(() => setBtErr("回測資料讀不到。"));
  }, [tab, bt]);

  const rows = tab === "live" ? live : bt;
  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return (rows || []).filter(
      (r) => (status === "all" || r.status === status) && (!needle || r.symbol.includes(needle)),
    );
  }, [rows, status, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const stats = useMemo(() => {
    const all = rows || [];
    const passed = all.filter((r) => r.status === "passed");
    const withR = passed.map((r) => r.r4h).filter((x): x is number => x != null);
    const up = withR.filter((x) => x > 0).length;
    const sorted = [...withR].sort((a, b) => a - b);
    const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    return { total: all.length, passed: passed.length, symbols: new Set(all.map((r) => r.symbol)).size, up, n4h: withR.length, med };
  }, [rows]);

  const err = tab === "live" ? liveErr : btErr;

  return (
    <div className="explorer">
      <div className="toolbar">
        <div className="seg">
          <button className={tab === "live" ? "on" : ""} onClick={() => { setTab("live"); setPage(0); setSel(null); }}>線上</button>
          <button className={tab === "backtest" ? "on" : ""} onClick={() => { setTab("backtest"); setPage(0); setSel(null); }}>回測（9 月起）</button>
        </div>
        <div className="toolbar-actions">
          <label className="field inline">
            狀態
            <select value={status} onChange={(e) => { setStatus(e.target.value as StatusFilter); setPage(0); }}>
              <option value="passed">通過（發 Telegram）</option>
              <option value="failed">未過</option>
              <option value="pending">觀察中</option>
              <option value="error">資料不足</option>
              <option value="all">全部爆量</option>
            </select>
          </label>
          <label className="field inline">
            幣別
            <input value={q} placeholder="例如 GTC" onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </label>
        </div>
      </div>

      <div className="cards" style={{ margin: "10px 0 14px" }}>
        <div className="card"><b>{num(stats.total)}</b><span>爆量（第一層）</span><em>{num(stats.symbols)} 個幣</em></div>
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

      {sel ? (
        <section className="chart-sticky">
          <h2>
            {sel.symbol} · 爆量收盤 {taipei(new Date(sel.closeMs).toISOString())}{" "}
            <button className="btn" onClick={() => setSel(null)}>關閉</button>
          </h2>
          <BurstChart symbol={sel.symbol} closeMs={sel.closeMs} />
        </section>
      ) : null}

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
                  <tr key={r.key} onClick={() => setSel(r)} style={{ cursor: "pointer" }} className={sel?.key === r.key ? "on" : ""}>
                    <td style={{ whiteSpace: "nowrap" }}>{taipei(new Date(r.closeMs).toISOString()).replace(":00 台北", "")}</td>
                    <td>{r.symbol}{r.source === "manual" ? <span className="sym"> 手冊</span> : null}</td>
                    <td>{r.close == null ? "—" : r.close.toPrecision(6)}</td>
                    <td className={cls(r.ret)}>{pct(r.ret)}</td>
                    <td>{r.rvol == null ? "—" : r.rvol.toFixed(1)}</td>
                    <td>{r.taker == null ? "—" : r.taker.toFixed(3)}</td>
                    <td className={cls(r.oiChg)}>{pct(r.oiChg)}</td>
                    <td>{r.obsP == null ? "—" : r.obsP.toFixed(4)}</td>
                    <td title={r.reason || ""}>{STATUS_LABEL[r.status]}</td>
                    {tab === "backtest" ? (
                      <td className={cls(r.r4h)}>{pct(r.r4h)}</td>
                    ) : (
                      <td>{r.telegram ? "已送" : "—"}</td>
                    )}
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
