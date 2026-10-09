"use client";

import { useEffect, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { num, pct, taipei } from "@/lib/format";
import { STATUS_LABEL, isShown, type SignalStatus } from "@/lib/research";

type Row = {
  id: number; symbol: string; burst_open: string; burst_close: string; status: SignalStatus; reason: string | null;
  close: number | null; ret: number | null; rvol: number | null; taker_ratio: number | null;
  oi_chg: number | null; obs_p: number | null; telegram_sent: boolean;
};
type Live = {
  generated_at: string;
  worker: { name: string; heartbeat: string; meta: Record<string, unknown> }[];
};
/** Failed (未過) rows are dropped here; counts only cover passed / pending / error. */
type Snapshot = Live & {
  counts: { passed: number; pending: number; last_24h: number };
  recent: Row[];
};

const POLL_MS = 10_000;

export function LiveBoard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let dead = false;
    const pull = async () => {
      try {
        const call = async <T,>(fn: string) => {
          const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
            method: "POST",
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
          });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as T;
        };
        const [live, rows] = await Promise.all([call<Live>("dashboard_research_live"), call<Row[]>("dashboard_research_signals")]);
        const shown = (rows || []).filter((r) => isShown(r.status));
        const dayAgo = Date.now() - 86_400_000;
        const j: Snapshot = {
          generated_at: live.generated_at,
          worker: live.worker,
          counts: {
            passed: shown.filter((r) => r.status === "passed").length,
            pending: shown.filter((r) => r.status === "pending").length,
            last_24h: shown.filter((r) => Date.parse(r.burst_open) >= dayAgo).length,
          },
          recent: shown.slice(0, 30),
        };
        if (!dead) { setSnap(j); setErr(null); }
      } catch (e) {
        if (!dead) setErr(e instanceof Error && e.message === "404" ? "即時資料函式還沒建立（等 worker 上線）。" : "即時資料暫時讀不到。");
      }
    };
    pull();
    const id = setInterval(pull, POLL_MS);
    return () => { dead = true; clearInterval(id); };
  }, []);

  if (err) return <p className="err">{err}</p>;
  if (!snap) return <p className="note">載入中…</p>;
  const w = snap.worker[0];
  const age = w ? Math.round((now - Date.parse(w.heartbeat)) / 1000) : null;
  const r = (w?.meta?.research ?? {}) as Record<string, unknown>;
  const n = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : null);

  return (
    <div>
      <div className="cards">
        <div className="card">
          <b className={age != null && age < 120 ? "up" : "dn"}>{age == null ? "—" : `${age} 秒`}</b>
          <span>上次心跳</span><em>{w ? taipei(w.heartbeat) : "沒有 worker"}</em>
        </div>
        <div className="card"><b>{num(n("ready"))}<small> / {num(n("universe"))}</small></b><span>已暖機的幣</span><em>有現貨的永續</em></div>
        <div className="card"><b>{num(snap.counts.last_24h)}</b><span>24 小時訊號</span><em>通過＋觀察中</em></div>
        <div className="card"><b>{num(snap.counts.passed)}</b><span>累計通過</span><em>發 Telegram</em></div>
        <div className="card"><b>{num(snap.counts.pending)}</b><span>觀察中</span><em>等 15 分鐘判斷</em></div>
      </div>
      <p className="note">
        本輪掃描：{typeof r.last_cycle_tp === "string" ? `${r.last_cycle_tp.slice(0, 16)} 開盤那根` : "—"}，
        耗時 {n("last_cycle_s") ?? "—"} 秒；累計初篩 {num(n("prefilter"))} 次、候選 {num(n("candidates"))}、主動買賣比逾時 {num(n("taker_timeouts"))}。
      </p>
      <h2>最近的訊號（不含未過）</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>爆量收盤</th><th>幣別</th><th>收盤價</th><th>漲幅</th><th>相對量</th><th>主動買賣比</th><th>未平倉</th><th>觀察窗 p</th><th>狀態</th><th>Telegram</th></tr>
          </thead>
          <tbody>
            {snap.recent.map((x) => (
              <tr key={x.id}>
                <td style={{ whiteSpace: "nowrap" }}>{taipei(x.burst_close)}</td>
                <td>{x.symbol}</td>
                <td>{x.close == null ? "—" : x.close.toPrecision(6)}</td>
                <td>{pct(x.ret)}</td>
                <td>{x.rvol == null ? "—" : x.rvol.toFixed(1)}</td>
                <td>{x.taker_ratio == null ? "—" : x.taker_ratio.toFixed(3)}</td>
                <td>{pct(x.oi_chg)}</td>
                <td>{x.obs_p == null ? "—" : x.obs_p.toFixed(4)}</td>
                <td title={x.reason || ""}>{STATUS_LABEL[x.status]}</td>
                <td>{x.telegram_sent ? "已送" : "—"}</td>
              </tr>
            ))}
            {snap.recent.length === 0 ? <tr><td colSpan={10} className="note">還沒有訊號。</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
