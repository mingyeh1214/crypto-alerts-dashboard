"use client";

import { useEffect, useState } from "react";

type Fill = { reason: string; px: number; qty: number; pnl: number; tp: string };
type Trade = {
  symbol: string;
  signal_tp: string;
  entry_tp: string;
  exit_tp: string;
  entry: number;
  stop: number;
  pnl: number;
  r: number | null;
  reasons: string;
  fills: Fill[];
};
type Sim = {
  disclaimer: string;
  start_usdt: number;
  risk_pct: number;
  leverage_cap: number;
  rules: string[];
  signals_seen: number;
  taken: number;
  skipped_n: number;
  skipped: Record<string, number>;
  sept_end_equity: number;
  sept_pnl: number;
  sept_trades: number;
  final_equity: number;
  final_tp: string | null;
  win_rate: number | null;
  avg_r: number | null;
  expectancy_usdt: number | null;
  curve: { tp: string; equity: number }[];
  trades: Trade[];
  note: string;
};

function money(n: number) {
  const sign = n > 0 ? "+" : "";
  return (n > 0 ? sign : "") + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SimBoard() {
  const [data, setData] = useState<Sim | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/data/paper_sim.json")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json() as Promise<Sim>;
      })
      .then(setData)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "讀取失敗"));
  }, []);
  if (err) return <p className="err">模擬讀不到：{err}</p>;
  if (!data) return <p className="note">讀取模擬…</p>;
  const w = 640;
  const h = 180;
  const pts = data.curve;
  const min = Math.min(...pts.map((p) => p.equity), data.start_usdt);
  const max = Math.max(...pts.map((p) => p.equity), data.start_usdt);
  const span = Math.max(1e-6, max - min);
  const d = pts
    .map((p, i) => {
      const x = pts.length === 1 ? 0 : (i / (pts.length - 1)) * (w - 16) + 8;
      const y = h - 16 - ((p.equity - min) / span) * (h - 32);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const pnlCls = data.sept_pnl >= 0 ? "up" : "dn";
  return (
    <section>
      <div className="banner">{data.disclaimer}</div>
      <div className="cards">
        <div className="card"><b>1000</b><span>起始 USDT</span><em>2026-09-01 起</em></div>
        <div className="card"><b className={pnlCls}>{data.sept_end_equity.toFixed(2)}</b><span>9 月 30 日權益</span><em>{money(data.sept_pnl)} USDT</em></div>
        <div className="card"><b>{data.taken}</b><span>有做的單</span><em>跳過 {data.skipped_n} / {data.signals_seen}</em></div>
        <div className="card"><b>{data.win_rate == null ? "—" : `${(data.win_rate * 100).toFixed(1)}%`}</b><span>勝率</span><em>平均 {data.avg_r ?? "—"} R</em></div>
        <div className="card"><b>{data.expectancy_usdt == null ? "—" : money(data.expectancy_usdt)}</b><span>每筆期望 USDT</span><em>風險 {data.risk_pct}% · 槓桿 ≤ {data.leverage_cap}x</em></div>
      </div>
      <h2>權益</h2>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="180" role="img" aria-label="權益曲線">
        <path d={d} fill="none" stroke="#e4b15a" strokeWidth="2" />
      </svg>
      <p className="note">{data.note} 最後一筆出場 {data.final_tp}，帳戶 {data.final_equity.toFixed(2)} USDT。10 月的訊號若沒通過當下濾網，就不會做。</p>
      <h2>規則（下單前就定死）</h2>
      <ul className="note">
        {data.rules.map((r) => <li key={r}>{r}</li>)}
      </ul>
      <h2>為什麼沒做</h2>
      <div className="scroll">
        <table>
          <thead><tr><th className="left">原因</th><th>筆數</th></tr></thead>
          <tbody>
            {Object.entries(data.skipped).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <tr key={k}><td className="left">{k}</td><td>{n}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>成交明細</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">進場（台北）</th>
              <th className="left">幣</th>
              <th>進場價</th>
              <th>止損</th>
              <th className="left">出場</th>
              <th>損益 USDT</th>
              <th>R</th>
            </tr>
          </thead>
          <tbody>
            {data.trades.map((t) => (
              <tr key={t.symbol + t.entry_tp}>
                <td className="left">{t.entry_tp}</td>
                <td className="left">{t.symbol}</td>
                <td>{t.entry}</td>
                <td>{t.stop}</td>
                <td className="left">{t.exit_tp} · {t.reasons}</td>
                <td className={t.pnl >= 0 ? "up" : "dn"}>{money(t.pnl)}</td>
                <td className={t.pnl >= 0 ? "up" : "dn"}>{t.r}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
