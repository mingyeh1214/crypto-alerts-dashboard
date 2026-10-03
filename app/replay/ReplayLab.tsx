"use client";

import { useMemo, useState } from "react";
import { pct, taipei } from "@/lib/format";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";

type Params = {
  surge_mult: number;
  quiet_mult: number;
  min_bar_return: number;
  max_prior_24h: number;
  oi_z_min: number;
  oi_1h_bars: number;
  oi_z_lookback: number;
  oi_z_min_periods: number;
  baseline_bars: number;
  quiet_1h_bars: number;
  quiet_4h_bars: number;
  require_prior_24h: boolean;
  symbol: string;
};

type Signal = {
  symbol: string;
  bar_close: string;
  close: number | null;
  multiple: number | null;
  quiet_1h: number | null;
  quiet_4h: number | null;
  ret_bar: number | null;
  prior_24h: number | null;
  oi_1h: number | null;
  oi_z: number | null;
  oi_5m: number | null;
};

type Coverage = {
  kline_min: string | null;
  kline_max: string | null;
  kline_rows: number;
  kline_symbols: number;
  oi_min: string | null;
  oi_max: string | null;
  oi_rows: number;
  oi_symbols: number;
  max_completed_15m: number;
  max_oi_points: number;
};

type Result = {
  generated_at: string;
  coverage: Coverage;
  price_hits: number;
  signal_count: number;
  reason: string | null;
  signals: Signal[];
};

const LIVE: Params = {
  surge_mult: 10,
  quiet_mult: 3,
  min_bar_return: 0.01,
  max_prior_24h: 0.08,
  oi_z_min: 1,
  oi_1h_bars: 12,
  oi_z_lookback: 2016,
  oi_z_min_periods: 600,
  baseline_bars: 2880,
  quiet_1h_bars: 4,
  quiet_4h_bars: 16,
  require_prior_24h: true,
  symbol: "",
};

const FIT: Params = {
  ...LIVE,
  baseline_bars: 8,
  quiet_4h_bars: 8,
  oi_z_lookback: 72,
  oi_z_min_periods: 30,
  require_prior_24h: false,
};

function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function ReplayLab() {
  const [p, setP] = useState<Params>(LIVE);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Result | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const all = data?.signals ?? [];
    if (!needle) return all;
    return all.filter((r) => r.symbol.includes(needle));
  }, [data, q]);

  function set<K extends keyof Params>(key: K, value: Params[K]) {
    setP((prev) => ({ ...prev, [key]: value }));
  }

  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_param_backtest`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...p,
          symbol: p.symbol.trim() ? p.symbol.trim().toUpperCase() : null,
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(explainApi(text, res.status));
      }
      setData((await res.json()) as Result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "回測失敗");
    } finally {
      setBusy(false);
    }
  }

  const cov = data?.coverage;

  return (
    <div>
      <div className="toolbar">
        <div className="seg">
          <button type="button" className={same(p, LIVE) ? "on" : ""} onClick={() => setP(LIVE)}>
            線上參數
          </button>
          <button type="button" className={same(p, FIT) ? "on" : ""} onClick={() => setP(FIT)}>
            配合目前資料
          </button>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={run} disabled={busy}>
            {busy ? "計算中…" : "跑回測"}
          </button>
        </div>
      </div>
      <p className="note">
        線上是 30 日（2880 根 15 分）基準、前 24h 上限、OI z 仍是約 7 日（2016 根 5 分，至少約 600 根）。
        基準已對齊資料庫大約 30 日的 1 分 K。剛補齊的視窗裡，要先累滿 2880 根才評得到最新那段。
        「配合目前資料」把基準降到 8 根、略過 24h、OI 樣本降到 30，方便先看得到清單。這不會改 Telegram。
      </p>

      <div className="filters">
        <Num label="放量倍數" value={p.surge_mult} onChange={(v) => set("surge_mult", v)} />
        <Num label="安靜上限（倍）" value={p.quiet_mult} onChange={(v) => set("quiet_mult", v)} />
        <Num label="轉強（小數，0.01=+1%）" value={p.min_bar_return} step="0.001" onChange={(v) => set("min_bar_return", v)} />
        <Num label="前 24h 上限" value={p.max_prior_24h} step="0.01" onChange={(v) => set("max_prior_24h", v)} />
        <Num label="基準 15 分根數" value={p.baseline_bars} step="1" onChange={(v) => set("baseline_bars", v)} />
        <Num label="安靜 1h 根數" value={p.quiet_1h_bars} step="1" onChange={(v) => set("quiet_1h_bars", v)} />
        <Num label="安靜 4h 根數" value={p.quiet_4h_bars} step="1" onChange={(v) => set("quiet_4h_bars", v)} />
        <Num label="OI z 門檻" value={p.oi_z_min} step="0.1" onChange={(v) => set("oi_z_min", v)} />
        <Num label="OI 1h（5 分根數）" value={p.oi_1h_bars} step="1" onChange={(v) => set("oi_1h_bars", v)} />
        <Num label="OI z 回看根數" value={p.oi_z_lookback} step="1" onChange={(v) => set("oi_z_lookback", v)} />
        <Num label="OI 最少樣本" value={p.oi_z_min_periods} step="1" onChange={(v) => set("oi_z_min_periods", v)} />
        <label className="field">
          幣別（空白＝全部）
          <input value={p.symbol} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="BTCUSDT" />
        </label>
        <label className="field inline">
          <input
            type="checkbox"
            checked={p.require_prior_24h}
            onChange={(e) => set("require_prior_24h", e.target.checked)}
          />
          套用前 24h 上限
        </label>
      </div>

      {err && <p className="err">{err}</p>}

      {cov && (
        <>
          <div className="cards">
            <div className="card">
              <b>{cov.kline_symbols}</b>
              <span>1 分 K 幣數</span>
              <em>{cov.kline_rows.toLocaleString()} 根</em>
            </div>
            <div className="card">
              <b>{cov.max_completed_15m}</b>
              <span>單幣最多完整 15 分</span>
              <em>{taipei(cov.kline_min).replace(" 台北", "")} 起</em>
            </div>
            <div className="card">
              <b>{cov.oi_symbols}</b>
              <span>5 分 OI 幣數</span>
              <em>{cov.oi_rows.toLocaleString()} 根 · 最多 {cov.max_oi_points}</em>
            </div>
            <div className="card">
              <b>{data?.signal_count ?? 0}</b>
              <span>OI 也過的訊號</span>
              <em>量價先過 {data?.price_hits ?? 0}</em>
            </div>
          </div>
          {data?.reason && <div className="banner">{data.reason}</div>}
          <div className="toolbar">
            <label className="field">
              清單再篩幣
              <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="篩這次結果" />
            </label>
            <span className="note">顯示 {rows.length} / {data?.signals.length ?? 0}（最多回 300 筆，新的在上）</span>
          </div>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="left">時間</th>
                  <th className="left">幣</th>
                  <th>收盤</th>
                  <th>倍數</th>
                  <th>安靜 1h</th>
                  <th>安靜 4h</th>
                  <th>轉強</th>
                  <th>前 24h</th>
                  <th>OI 1h</th>
                  <th>OI 5 分</th>
                  <th>OI z</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td className="left" colSpan={11}>{data?.reason || "沒有符合的訊號。"}</td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.symbol + r.bar_close}>
                    <td className="left">{taipei(r.bar_close)}</td>
                    <td className="left">{r.symbol}</td>
                    <td>{r.close ?? "—"}</td>
                    <td>{r.multiple == null ? "—" : r.multiple.toFixed(1)}</td>
                    <td>{r.quiet_1h == null ? "—" : r.quiet_1h.toFixed(2)}</td>
                    <td>{r.quiet_4h == null ? "—" : r.quiet_4h.toFixed(2)}</td>
                    <td className={cls(r.ret_bar)}>{pct(r.ret_bar)}</td>
                    <td className={cls(r.prior_24h)}>{pct(r.prior_24h)}</td>
                    <td className={cls(r.oi_1h)}>{pct(r.oi_1h)}</td>
                    <td className={cls(r.oi_5m)}>{pct(r.oi_5m)}</td>
                    <td>{r.oi_z == null ? "—" : r.oi_z.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Num({
  label,
  value,
  step = "0.1",
  onChange,
}: {
  label: string;
  value: number;
  step?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(num(e.target.value, value))}
      />
    </label>
  );
}

function explainApi(text: string, status: number): string {
  try {
    const body = JSON.parse(text) as { code?: string; message?: string };
    const msg = body.message || "";
    if (body.code === "57014" || /statement timeout/i.test(msg)) {
      return "回測超過資料庫 3 秒上限，清單沒算出來。先按「配合目前資料」，或只填一個幣別再跑。";
    }
    if (msg) return `回測失敗：${msg}`;
  } catch {
    /* not json */
  }
  return text.slice(0, 280) || `HTTP ${status}`;
}

function cls(x: number | null): string {
  if (x == null || x === 0) return "";
  return x > 0 ? "up" : "dn";
}

function same(a: Params, b: Params): boolean {
  return (Object.keys(b) as (keyof Params)[]).every((k) => a[k] === b[k]);
}
