"use client";

import { useEffect, useMemo, useState } from "react";
import { pct, taipei } from "@/lib/format";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/public-config";
import { WIN_CSV_HEADER, winCells, winCsv, winHeaders, type WinMap } from "@/components/ExtremeCell";

const WINDOW_START = "2026-09-01";
const SINCE_ISO = "2026-09-01T00:00:00+08:00";

type HistRow = {
  symbol: string;
  base: string;
  rule: "early_oi" | "early_no_oi";
  time: string;
  close: number | null;
  multiple: number | null;
  quiet_1h: number | null;
  quiet_4h: number | null;
  ret_bar: number | null;
  prior_24h: number | null;
  oi_1h: number | null;
  oi_z: number | null;
  ret_15m: number | null;
  ret_30m: number | null;
  ret_1h: number | null;
  ret_4h: number | null;
  ret_1d: number | null;
  max_up: number | null;
  max_dn: number | null;
  win?: WinMap | null;
};

type HistPayload = {
  window_start: string;
  window_end: string;
  rows: HistRow[];
};

type LiveEntry = {
  id: number;
  symbol: string;
  triggered_at: string;
  bar_close: string;
  close: number | null;
  multiple: number | null;
  quiet_1h: number | null;
  quiet_4h: number | null;
  ret_bar: number | null;
  prior_24h: number | null;
  oi_1h: number | null;
  oi_z: number | null;
  telegram_sent: boolean;
  watch_status: string | null;
  m5_status: string | null;
  m15_status: string | null;
  m4h_sent: boolean | null;
  m1d_sent: boolean | null;
  end_reason: string | null;
  ret_15m: number | null;
  ret_4h: number | null;
  ret_1d: number | null;
};

type LivePayload = {
  generated_at: string;
  entries: LiveEntry[];
};

type Source = "backtest" | "live" | "both";

type EventRow = {
  key: string;
  symbol: string;
  base: string;
  time: string;
  rule: "early_oi" | "early_no_oi";
  source: Source;
  close: number | null;
  multiple: number | null;
  quiet_1h: number | null;
  quiet_4h: number | null;
  ret_bar: number | null;
  prior_24h: number | null;
  oi_1h: number | null;
  oi_z: number | null;
  ret_15m: number | null;
  ret_30m: number | null;
  ret_1h: number | null;
  ret_4h: number | null;
  ret_1d: number | null;
  max_up: number | null;
  max_dn: number | null;
  win?: WinMap | null;
  telegram_sent: boolean | null;
  watch_status: string | null;
  m5_status: string | null;
  m15_status: string | null;
  end_reason: string | null;
};

type OiFilter = "all" | "pass" | "spot";
type RetFilter = "all" | "up" | "up5" | "up10" | "dn" | "dn5" | "na";
type SourceFilter = "all" | "backtest" | "live";
type SortKey = "time" | "symbol" | "multiple" | "oi_z" | "ret4" | "ret1d";
type Tab = "rows" | "coins";

type Agg = {
  symbol: string;
  base: string;
  n: number;
  live: number;
  med4: number | null;
  med1d: number | null;
  win1d: number | null;
  medUp: number | null;
};

const STATUS: Record<string, string> = {
  active: "追蹤中",
  completed: "已完成",
  invalid: "已失效",
  valid: "有效",
  observe: "觀察",
};

const SOURCE_LABEL: Record<Source, string> = {
  backtest: "回測",
  live: "即時",
  both: "回測＋即時",
};

function cls(n: number | null | undefined) {
  if (n == null || n === 0) return "";
  return n > 0 ? "up" : "dn";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}

function price(n: number | null) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const d = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}

function matchRet(v: number | null, k: RetFilter) {
  if (k === "all") return true;
  if (k === "na") return v == null;
  if (v == null) return false;
  if (k === "up") return v > 0;
  if (k === "up5") return v >= 0.05;
  if (k === "up10") return v >= 0.1;
  if (k === "dn") return v < 0;
  return v <= -0.05;
}

function numSort(v: number | null) {
  return v == null ? Number.NEGATIVE_INFINITY : v;
}

function baseOf(symbol: string) {
  return symbol.replace(/USDT$/, "");
}

function taipeiMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

function pick<T>(live: T | null | undefined, hist: T | null | undefined): T | null {
  return live != null ? live : hist != null ? hist : null;
}

function merge(hist: HistRow[], live: LiveEntry[]): EventRow[] {
  const map = new Map<string, EventRow>();
  for (const r of hist) {
    if (r.time.slice(0, 10) < WINDOW_START) continue;
    const key = r.symbol + "|" + r.time.slice(0, 16);
    map.set(key, {
      key,
      symbol: r.symbol,
      base: r.base || baseOf(r.symbol),
      time: r.time.slice(0, 16),
      rule: r.rule,
      source: "backtest",
      close: r.close,
      multiple: r.multiple,
      quiet_1h: r.quiet_1h,
      quiet_4h: r.quiet_4h,
      ret_bar: r.ret_bar,
      prior_24h: r.prior_24h,
      oi_1h: r.oi_1h,
      oi_z: r.oi_z,
      ret_15m: r.ret_15m,
      ret_30m: r.ret_30m,
      ret_1h: r.ret_1h,
      ret_4h: r.ret_4h,
      ret_1d: r.ret_1d,
      max_up: r.max_up,
      max_dn: r.max_dn,
      win: r.win ?? null,
      telegram_sent: null,
      watch_status: null,
      m5_status: null,
      m15_status: null,
      end_reason: null,
    });
  }
  for (const e of live) {
    const time = taipeiMinute(e.bar_close);
    if (time.slice(0, 10) < WINDOW_START) continue;
    const key = e.symbol + "|" + time;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        key,
        symbol: e.symbol,
        base: baseOf(e.symbol),
        time,
        rule: "early_oi",
        source: "live",
        close: e.close,
        multiple: e.multiple,
        quiet_1h: e.quiet_1h,
        quiet_4h: e.quiet_4h,
        ret_bar: e.ret_bar,
        prior_24h: e.prior_24h,
        oi_1h: e.oi_1h,
        oi_z: e.oi_z,
        ret_15m: e.ret_15m,
        ret_30m: null,
        ret_1h: null,
        ret_4h: e.ret_4h,
        ret_1d: e.ret_1d,
        max_up: null,
        max_dn: null,
        win: null,
        telegram_sent: e.telegram_sent,
        watch_status: e.watch_status,
        m5_status: e.m5_status,
        m15_status: e.m15_status,
        end_reason: e.end_reason,
      });
      continue;
    }
    map.set(key, {
      ...prev,
      source: "both",
      rule: "early_oi",
      close: pick(e.close, prev.close),
      multiple: pick(e.multiple, prev.multiple),
      quiet_1h: pick(e.quiet_1h, prev.quiet_1h),
      quiet_4h: pick(e.quiet_4h, prev.quiet_4h),
      ret_bar: pick(e.ret_bar, prev.ret_bar),
      prior_24h: pick(e.prior_24h, prev.prior_24h),
      oi_1h: pick(e.oi_1h, prev.oi_1h),
      oi_z: pick(e.oi_z, prev.oi_z),
      ret_15m: pick(e.ret_15m, prev.ret_15m),
      ret_4h: pick(e.ret_4h, prev.ret_4h),
      ret_1d: pick(e.ret_1d, prev.ret_1d),
      telegram_sent: e.telegram_sent,
      watch_status: e.watch_status,
      m5_status: e.m5_status ?? prev.m5_status,
      m15_status: e.m15_status,
      end_reason: e.end_reason,
    });
  }
  return [...map.values()];
}

export function SignalLog() {
  const [hist, setHist] = useState<HistPayload | null>(null);
  const [live, setLive] = useState<LiveEntry[]>([]);
  const [liveAt, setLiveAt] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [liveErr, setLiveErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState(WINDOW_START);
  const [to, setTo] = useState("");
  const [oi, setOi] = useState<OiFilter>("pass");
  const [ret, setRet] = useState<RetFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [sort, setSort] = useState<SortKey>("time");
  const [tab, setTab] = useState<Tab>("rows");
  const [pageSize, setPageSize] = useState(40);
  const [page, setPage] = useState(0);
  const [pin, setPin] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/data/full_market.json")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json() as Promise<HistPayload>;
      })
      .then((j) => {
        if (!cancel) setHist(j);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : "讀取失敗");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    async function load() {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/dashboard_signals`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ since: SINCE_ISO }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = (await res.json()) as LivePayload;
        if (cancel) return;
        setLive(json.entries ?? []);
        setLiveAt(new Date().toISOString());
        setLiveErr(null);
      } catch (e) {
        if (!cancel) setLiveErr(e instanceof Error ? e.message : "即時讀取失敗");
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancel = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [q, from, to, oi, ret, source, sort, tab, pageSize, pin]);

  const events = useMemo(() => merge(hist?.rows ?? [], live), [hist, live]);

  const view = useMemo(() => {
    const query = q.trim().toUpperCase();
    const rows = events.filter((r) => {
      if (pin && r.symbol !== pin) return false;
      if (query && !r.symbol.includes(query) && !r.base.toUpperCase().includes(query)) return false;
      const day = r.time.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (oi === "pass" && r.rule !== "early_oi") return false;
      if (oi === "spot" && r.rule !== "early_no_oi") return false;
      if (source === "backtest" && r.source === "live") return false;
      if (source === "live" && r.source === "backtest") return false;
      if (!matchRet(r.ret_1d, ret)) return false;
      return true;
    });

    const bySym = new Map<string, EventRow[]>();
    for (const r of rows) {
      const list = bySym.get(r.symbol);
      if (list) list.push(r);
      else bySym.set(r.symbol, [r]);
    }
    const aggs: Agg[] = [];
    for (const [symbol, list] of bySym) {
      const r1d = list.map((x) => x.ret_1d).filter((x): x is number => x != null);
      const r4 = list.map((x) => x.ret_4h).filter((x): x is number => x != null);
      const up = list.map((x) => x.max_up).filter((x): x is number => x != null);
      const wins = r1d.filter((x) => x > 0).length;
      aggs.push({
        symbol,
        base: list[0].base,
        n: list.length,
        live: list.filter((x) => x.source !== "backtest").length,
        med4: median(r4),
        med1d: median(r1d),
        win1d: r1d.length ? wins / r1d.length : null,
        medUp: median(up),
      });
    }
    aggs.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "multiple") return b.n - a.n || a.symbol.localeCompare(b.symbol);
      if (sort === "ret1d") return numSort(b.med1d) - numSort(a.med1d) || a.symbol.localeCompare(b.symbol);
      if (sort === "ret4") return numSort(b.med4) - numSort(a.med4) || a.symbol.localeCompare(b.symbol);
      if (sort === "oi_z") return b.live - a.live || a.symbol.localeCompare(b.symbol);
      return b.n - a.n || a.symbol.localeCompare(b.symbol);
    });

    const shown = [...rows];
    shown.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol) || (a.time < b.time ? 1 : -1);
      if (sort === "multiple") return numSort(b.multiple) - numSort(a.multiple) || (a.time < b.time ? 1 : -1);
      if (sort === "oi_z") return numSort(b.oi_z) - numSort(a.oi_z) || (a.time < b.time ? 1 : -1);
      if (sort === "ret4") return numSort(b.ret_4h) - numSort(a.ret_4h) || (a.time < b.time ? 1 : -1);
      if (sort === "ret1d") return numSort(b.ret_1d) - numSort(a.ret_1d) || (a.time < b.time ? 1 : -1);
      return a.time < b.time ? 1 : a.time > b.time ? -1 : a.symbol.localeCompare(b.symbol);
    });

    const all1d = shown.map((x) => x.ret_1d).filter((x): x is number => x != null);
    const wins = all1d.filter((x) => x > 0).length;
    const liveN = shown.filter((x) => x.source !== "backtest").length;
    return {
      aggs,
      rows: shown,
      med1d: median(all1d),
      win1d: all1d.length ? wins / all1d.length : null,
      n1d: all1d.length,
      liveN,
    };
  }, [events, q, from, to, oi, ret, source, sort, pin]);

  function reset() {
    setQ("");
    setFrom(WINDOW_START);
    setTo("");
    setOi("pass");
    setRet("all");
    setSource("all");
    setSort("time");
    setPin(null);
    setPage(0);
  }

  function downloadCsv() {
    const lines = [
      "time_taipei,symbol,base,rule,source,close,multiple,oi_z,oi_1h,quiet_1h,quiet_4h,ret_bar,prior_24h,ret_15m,ret_30m,ret_1h,ret_4h,ret_1d," +
        WIN_CSV_HEADER +
        ",max_up,max_dn,telegram_sent,watch_status",
    ];
    for (const r of view.rows) {
      lines.push(
        [
          r.time,
          r.symbol,
          r.base,
          r.rule,
          r.source,
          r.close ?? "",
          r.multiple ?? "",
          r.oi_z ?? "",
          r.oi_1h ?? "",
          r.quiet_1h ?? "",
          r.quiet_4h ?? "",
          r.ret_bar ?? "",
          r.prior_24h ?? "",
          r.ret_15m ?? "",
          r.ret_30m ?? "",
          r.ret_1h ?? "",
          r.ret_4h ?? "",
          r.ret_1d ?? "",
          ...winCsv(r.win),
          r.max_up ?? "",
          r.max_dn ?? "",
          r.telegram_sent == null ? "" : r.telegram_sent ? 1 : 0,
          r.watch_status ?? "",
        ].join(","),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quiet-surge-signals.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (err) return <p className="err">回測資料讀取失敗：{err}</p>;
  if (!hist) return <p className="note">正在載入訊號紀錄…</p>;

  const list = tab === "coins" ? view.aggs : view.rows;
  const size = pageSize <= 0 ? list.length || 1 : pageSize;
  const pages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * size;
  const slice = list.slice(start, start + size);
  const latest = view.rows[0]?.time;

  return (
    <section className="explorer">
      <p className="note">
        回測檔窗口 {hist.window_start} → {hist.window_end}（台北）。
        即時進場從 Supabase <code>dashboard_signals</code> 每 60 秒合併。回測列以 15 分收線對齊；新的線上進場是 1 分收盤。
        上次抓取：{liveAt ? taipei(liveAt) : "…"}
        {liveErr ? <span className="err">　即時更新失敗（仍顯示回測）：{liveErr}</span> : null}
        {latest ? `　目前最新一筆 ${latest}` : null}
      </p>

      <div className="filters">
        <label className="field">
          幣別搜尋
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例如 AR、RED" autoComplete="off" />
        </label>
        <label className="field">
          日期起（台北）
          <input type="date" value={from} min={WINDOW_START} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          日期迄（台北）
          <input type="date" value={to} min={WINDOW_START} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          合約 OI
          <select value={oi} onChange={(e) => setOi(e.target.value as OiFilter)}>
            <option value="pass">有 OI、訊號通過</option>
            <option value="all">全部（含僅現貨回測）</option>
            <option value="spot">無合約 OI（僅現貨回測）</option>
          </select>
        </label>
        <label className="field">
          +1 日報酬
          <select value={ret} onChange={(e) => setRet(e.target.value as RetFilter)}>
            <option value="all">全部</option>
            <option value="up">上漲（&gt;0）</option>
            <option value="up5">≥ +5%</option>
            <option value="up10">≥ +10%</option>
            <option value="dn">下跌（&lt;0）</option>
            <option value="dn5">≤ −5%</option>
            <option value="na">尚無 +1 日</option>
          </select>
        </label>
        <label className="field">
          來源
          <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
            <option value="all">回測＋即時</option>
            <option value="backtest">只有回測</option>
            <option value="live">含即時進場</option>
          </select>
        </label>
        <label className="field">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="time">時間 新→舊</option>
            <option value="symbol">代號 A→Z</option>
            <option value="multiple">倍數 高→低</option>
            <option value="oi_z">OI z 高→低</option>
            <option value="ret4">+4 時 高→低</option>
            <option value="ret1d">+1 日 高→低</option>
          </select>
        </label>
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist">
          <button type="button" className={tab === "rows" ? "on" : ""} onClick={() => setTab("rows")}>
            單筆 {view.rows.length}
          </button>
          <button type="button" className={tab === "coins" ? "on" : ""} onClick={() => setTab("coins")}>
            各幣 {view.aggs.length}
          </button>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={() => setDetail((v) => !v)}>
            {detail ? "隱藏細項" : "顯示細項"}
          </button>
          <button type="button" className="btn" onClick={downloadCsv}>
            下載目前篩選 CSV
          </button>
          <button type="button" className="btn" onClick={reset}>
            清除篩選
          </button>
        </div>
      </div>

      {pin && (
        <p className="banner">
          已鎖定 {pin}。
          <button type="button" className="btn" onClick={() => setPin(null)}>
            取消鎖定
          </button>
        </p>
      )}

      <div className="cards">
        <div className="card">
          <b>{view.rows.length}</b>
          <span>符合的訊號</span>
        </div>
        <div className="card">
          <b>{view.liveN}</b>
          <span>其中含即時進場</span>
        </div>
        <div className="card">
          <b className={cls(view.med1d)}>{pct(view.med1d)}</b>
          <span>篩選後 +1 日中位</span>
        </div>
        <div className="card">
          <b>{view.win1d == null ? "—" : pct(view.win1d, 1)}</b>
          <span>+1 日上漲比例（n={view.n1d}）</span>
        </div>
      </div>

      <div className="scroll">
        {tab === "coins" ? (
          <table>
            <thead>
              <tr>
                <th className="left">幣</th>
                <th>訊號</th>
                <th>含即時</th>
                <th>+4 時中位</th>
                <th>+1 日中位</th>
                <th>+1 日上漲</th>
                <th>最大漲中位</th>
              </tr>
            </thead>
            <tbody>
              {(slice as Agg[]).map((a) => (
                <tr key={a.symbol} className={pin === a.symbol ? "pinned" : ""}>
                  <td className="left">
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        setPin(a.symbol);
                        setTab("rows");
                      }}
                    >
                      {a.base}
                    </button>
                    <div className="sym">{a.symbol}</div>
                  </td>
                  <td>{a.n}</td>
                  <td>{a.live}</td>
                  <td className={cls(a.med4)}>{pct(a.med4)}</td>
                  <td className={cls(a.med1d)}>{pct(a.med1d)}</td>
                  <td>{a.win1d == null ? "—" : pct(a.win1d, 0)}</td>
                  <td className={cls(a.medUp)}>{pct(a.medUp)}</td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td className="left" colSpan={7}>
                    沒有符合的幣。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th className="left">收線（台北）</th>
                <th className="left">幣</th>
                <th className="left">來源</th>
                <th>收盤</th>
                <th>倍數</th>
                <th>OI z</th>
                <th>+15 分</th>
                <th>+4 時</th>
                <th>+1 日</th>
                {winHeaders()}
                <th>至今最大漲</th>
                <th>至今最大跌</th>
                {detail && (
                  <>
                    <th>OI 1h</th>
                    <th>安靜 1h</th>
                    <th>安靜 4h</th>
                    <th>當根</th>
                    <th>前 24h</th>
                    <th>+30 分</th>
                    <th>+1 時</th>
                    <th className="left">追蹤</th>
                    <th>Telegram</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(slice as EventRow[]).map((r) => (
                <tr key={r.key}>
                  <td className="left">{r.time}</td>
                  <td className="left">
                    <button type="button" className="linkish" onClick={() => setPin(r.symbol)}>
                      {r.base}
                    </button>
                  </td>
                  <td className="left">{SOURCE_LABEL[r.source]}</td>
                  <td>{price(r.close)}</td>
                  <td>{r.multiple == null ? "—" : r.multiple.toFixed(1) + "×"}</td>
                  <td>{r.oi_z == null ? "—" : r.oi_z.toFixed(2)}</td>
                  <td className={cls(r.ret_15m)}>{pct(r.ret_15m)}</td>
                  <td className={cls(r.ret_4h)}>{pct(r.ret_4h)}</td>
                  <td className={cls(r.ret_1d)}>{pct(r.ret_1d)}</td>
                  {winCells(r.win, r.key)}
                  <td className={cls(r.max_up)}>{pct(r.max_up)}</td>
                  <td className={cls(r.max_dn)}>{pct(r.max_dn)}</td>
                  {detail && (
                    <>
                      <td className={cls(r.oi_1h)}>{pct(r.oi_1h)}</td>
                      <td>{r.quiet_1h == null ? "—" : r.quiet_1h.toFixed(2) + "×"}</td>
                      <td>{r.quiet_4h == null ? "—" : r.quiet_4h.toFixed(2) + "×"}</td>
                      <td className={cls(r.ret_bar)}>{pct(r.ret_bar)}</td>
                      <td className={cls(r.prior_24h)}>{pct(r.prior_24h)}</td>
                      <td className={cls(r.ret_30m)}>{pct(r.ret_30m)}</td>
                      <td className={cls(r.ret_1h)}>{pct(r.ret_1h)}</td>
                      <td className="left">
                        {r.watch_status ? STATUS[r.watch_status] ?? r.watch_status : "—"}
                        {r.m5_status ? ` · +5分${STATUS[r.m5_status] ?? r.m5_status}` : ""}
                        {r.m15_status ? ` · +15分${STATUS[r.m15_status] ?? r.m15_status}` : ""}
                        {r.end_reason ? ` · ${r.end_reason}` : ""}
                      </td>
                      <td>{r.telegram_sent == null ? "—" : r.telegram_sent ? "已送" : "未送"}</td>
                    </>
                  )}
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td className="left" colSpan={detail ? 28 : 19}>
                    沒有符合的單筆。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="pager">
        <span>
          {list.length === 0 ? "0" : `${start + 1}–${Math.min(start + size, list.length)}`} / {list.length}
        </span>
        <label className="field inline">
          每頁
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={40}>40</option>
            <option value={100}>100</option>
            <option value={0}>全部</option>
          </select>
        </label>
        <button type="button" className="btn" disabled={safePage <= 0} onClick={() => setPage(safePage - 1)}>
          上一頁
        </button>
        <button type="button" className="btn" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
          下一頁
        </button>
      </div>
      <p className="note">
        預設只看 OI 通過（線上規則）。「僅現貨」是回測裡沒有永續 OI 的對照，不會出現在 Telegram。
        回測的「+15 分」是舊規則進場後 15 分收盤報酬。15分到 1日的最大漲跌是進場後那段 15 分 K 的最高／最低（價位、開盤時間、相對進場漲跌幅）。至今最大漲跌才是一路到資料結尾。線上新單若沒有對上這份回測，這幾格是空的。
        點幣別可鎖定該檔。不是投資建議。
      </p>
    </section>
  );
}
