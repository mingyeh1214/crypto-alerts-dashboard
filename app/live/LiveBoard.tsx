"use client";

import { useEffect, useState } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { taipei } from "@/lib/format";

type AlertRow = {
  id: number;
  symbol: string;
  market_type: string | null;
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  triggered_at: string;
  telegram_sent: boolean;
};

type WatchRow = {
  id: number;
  symbol: string;
  market_type: string;
  status: string;
  alert_time: string;
  alert_price: number;
  m5_status: string | null;
  m5_sent: boolean;
  m15_status: string | null;
  m15_sent: boolean;
  entry_tf: string | null;
  m4h_sent: boolean;
  m1d_sent: boolean;
  end_reason: string | null;
  ended_at: string | null;
};

type Worker = {
  name: string;
  heartbeat: string;
  last_symbol: string | null;
  meta: Record<string, unknown>;
};

type Snapshot = {
  generated_at: string;
  symbols_spot_enabled: number;
  rules_quiet_surge_enabled: number;
  rules_enabled_other: number;
  watches_active: number;
  watches_by_status: Record<string, number>;
  quiet_surge_symbols: string[];
  worker: Worker[];
  recent_alerts: AlertRow[];
  recent_watches: WatchRow[];
};

const STATUS: Record<string, string> = {
  active: "追蹤中",
  completed: "已完成",
  invalid: "已失效",
  valid: "有效",
  observe: "觀察",
};

export function LiveBoard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<string>("");

  async function load() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_live`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Snapshot;
      setData(json);
      setErr(null);
      setAt(new Date().toISOString());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "讀取失敗");
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const w = data?.worker?.[0];
  const meta = (w?.meta ?? {}) as Record<string, number | string | boolean>;

  return (
    <div>
      <p className="note">
        唯讀。瀏覽器只呼叫 <code>dashboard_live()</code>，用的是 anon key，不能改資料、也讀不到 K 線表。
        每 60 秒更新。上次抓取：{at ? taipei(at) : "…"}
        {err ? <span className="err">　{err}</span> : null}
      </p>

      <div className="cards">
        <div className="card">
          <b>{data ? data.rules_quiet_surge_enabled : "…"}</b>
          <span>啟用中的 quiet_surge_early</span>
        </div>
        <div className="card">
          <b>{meta.bars_ready ?? "…"}</b>
          <span>90 日基準就緒（可觸發）</span>
        </div>
        <div className="card">
          <b>{meta.oi_ready ?? "…"}</b>
          <span>OI 就緒</span>
        </div>
        <div className="card">
          <b>{data ? data.watches_active : "…"}</b>
          <span>進行中的進場後追蹤</span>
        </div>
        <div className="card">
          <b>{w ? taipei(w.heartbeat).replace(" 台北", "") : "…"}</b>
          <span>worker 心跳（台北）</span>
          <em>{typeof meta.status === "string" ? meta.status : ""}</em>
        </div>
      </div>

      <h2>最近警報</h2>
      <p className="note">
        新的進場是 1 分收盤（安靜後放量）。表裡仍可能有舊的 15 分進場與更早的箱型、量價紀錄。目前啟用的規則只有 quiet_surge_early
        {data ? `（其他啟用 ${data.rules_enabled_other} 條）` : ""}。
        全市場上線後，新的進場才會出現在這裡。
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">時間（台北）</th>
              <th className="left">幣</th>
              <th className="left">類型</th>
              <th className="left">標題</th>
              <th>Telegram</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent_alerts ?? []).map((a) => (
              <tr key={a.id}>
                <td className="left">{taipei(a.triggered_at)}</td>
                <td className="left">{a.symbol}</td>
                <td className="left">{a.alert_type}</td>
                <td className="left">{a.title}</td>
                <td>{a.telegram_sent ? "已送" : "未送"}</td>
              </tr>
            ))}
            {data && data.recent_alerts.length === 0 ? (
              <tr><td className="left" colSpan={5}>還沒有警報</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>進場後追蹤</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="left">警報時間</th>
              <th className="left">幣</th>
              <th className="left">狀態</th>
              <th>價</th>
              <th className="left">+5 分</th>
              <th className="left">+15 分</th>
              <th>+4 時</th>
              <th>+1 日</th>
              <th className="left">結束原因</th>
            </tr>
          </thead>
          <tbody>
            {(data?.recent_watches ?? []).map((wrow) => (
              <tr key={wrow.id}>
                <td className="left">{taipei(wrow.alert_time)}</td>
                <td className="left">{wrow.symbol}</td>
                <td className="left">{STATUS[wrow.status] ?? wrow.status}</td>
                <td>{wrow.alert_price}</td>
                <td className="left">{wrow.m5_status ? (STATUS[wrow.m5_status] ?? wrow.m5_status) : "—"}</td>
                <td className="left">{wrow.m15_status ? (STATUS[wrow.m15_status] ?? wrow.m15_status) : "—"}</td>
                <td>{wrow.m4h_sent ? "已送" : "—"}</td>
                <td>{wrow.m1d_sent ? "已送" : "—"}</td>
                <td className="left">{wrow.end_reason ?? "—"}</td>
              </tr>
            ))}
            {data && data.recent_watches.length === 0 ? (
              <tr><td className="left" colSpan={9}>目前沒有追蹤紀錄</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>監控名單（{data?.quiet_surge_symbols.length ?? "…"}）</h2>
      <div className="chips">
        {(data?.quiet_surge_symbols ?? []).map((s) => (
          <span className="chip" key={s}>{s.replace(/USDT$/, "")}</span>
        ))}
      </div>
    </div>
  );
}
