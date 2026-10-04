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
  rules_p12_enabled?: number;
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

const POLL_MS = 5_000;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function ageSec(iso: string | null | undefined, now: number) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((now - t) / 1000));
}

export function LiveBoard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<number>(0);
  const now = useNow();

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_live`, {
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Snapshot;
        if (cancel) return;
        setData(json);
        setErr(null);
        setAt(Date.now());
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "讀取失敗");
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancel = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const w = data?.worker?.[0];
  const meta = (w?.meta ?? {}) as Record<string, number | string | boolean>;
  const hbAge = ageSec(w?.heartbeat, now);
  const fetchAge = at ? Math.max(0, Math.round((now - at) / 1000)) : null;
  const p12 = (data?.recent_alerts ?? []).filter((a) => a.alert_type === "p12_z278");

  return (
    <div>
      <p className="note">
        現在時間每秒走，警報每 5 秒向資料庫抓一次，不用重新整理。
        現在：{taipei(new Date(now).toISOString())}
        。上次抓取：{at ? `${taipei(new Date(at).toISOString())}（${fetchAge} 秒前）` : "…"}
        {err ? <span className="err">　{err}</span> : null}
      </p>

      <div className="cards">
        <div className="card">
          <b>{taipei(new Date(now).toISOString()).replace(" 台北", "")}</b>
          <span>現在（台北）</span>
          <em>每秒更新</em>
        </div>
        <div className="card">
          <b>{data ? (data.rules_p12_enabled ?? data.rules_enabled_other ?? 0) : "…"}</b>
          <span>啟用中的 P12_z278</span>
        </div>
        <div className="card">
          <b>{meta.p12_ready ?? meta.quotes_ready ?? "…"}</b>
          <span>z 基準就緒（可觸發）</span>
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
          <b>{hbAge == null ? "…" : `${hbAge} 秒前`}</b>
          <span>worker 心跳</span>
          <em>{w ? taipei(w.heartbeat) : ""}{typeof meta.status === "string" ? ` · ${meta.status}` : ""}</em>
        </div>
      </div>

      <h2>最近警報</h2>
      <p className="note">
        只顯示 P12_z278，新進場寫進同一張 alerts 表，這頁與訊號頁一起讀。已送的會立刻出現在訊號明細；未送 Telegram 的補庫不會進訊號頁。
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
            {p12.map((a) => (
              <tr key={a.id}>
                <td className="left">{taipei(a.triggered_at)}</td>
                <td className="left">{a.symbol}</td>
                <td className="left">{a.alert_type}</td>
                <td className="left">{a.title}</td>
                <td>{a.telegram_sent ? "已送" : "未送"}</td>
              </tr>
            ))}
            {data && p12.length === 0 ? (
              <tr><td className="left" colSpan={5}>還沒有警報</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>進場後追蹤</h2>
      <p className="note">鎖定規則沒有 +5 分／+15 分追蹤。舊的 quiet_surge 追蹤已封存。</p>
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
            {(data?.recent_watches ?? []).filter((wrow) => wrow.status === "active" && false).map((wrow) => (
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
            {data && data.recent_watches.filter(() => false).length === 0 ? (
              <tr><td className="left" colSpan={9}>目前沒有追蹤紀錄</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2>現貨宇宙</h2>
      <p className="note">啟用中的現貨 {data ? data.symbols_spot_enabled : "…"} 檔（幣安現貨 USDT ∩ 永續）。worker 心跳的 meta.p12_universe 是實際套用鎖定規則的名單。</p>
    </div>
  );
}
