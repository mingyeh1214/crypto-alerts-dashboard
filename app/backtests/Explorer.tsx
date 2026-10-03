"use client";

import { useEffect, useMemo, useState } from "react";
import { pct } from "@/lib/format";

type Coin = {
  symbol: string;
  base: string;
  has_oi: boolean;
  status: "ok" | "short";
  bars: number;
  eval_days: number | null;
};

type Row = {
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
};

type Payload = {
  window_start: string;
  window_end: string;
  universe: number;
  events: number;
  notes: string;
  coins: Coin[];
  rows: Row[];
};

type OiFilter = "all" | "pass" | "spot";
type RetFilter = "all" | "up" | "up5" | "up10" | "dn" | "dn5" | "na";
type CountFilter = "all" | "0" | "1" | "3" | "5";
type HistFilter = "all" | "ok" | "short";
type SortKey = "symbol" | "n" | "med1d" | "med4" | "medUp";
type Tab = "coins" | "rows";

type Agg = Coin & {
  n: number;
  n1d: number;
  med4: number | null;
  med1d: number | null;
  win1d: number | null;
  medUp: number | null;
  medDn: number | null;
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

function countOk(n: number, k: CountFilter) {
  if (k === "all") return true;
  if (k === "0") return n === 0;
  if (k === "1") return n >= 1;
  if (k === "3") return n >= 3;
  return n >= 5;
}

function numSort(v: number | null) {
  return v == null ? Number.NEGATIVE_INFINITY : v;
}

export function Explorer() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [oi, setOi] = useState<OiFilter>("all");
  const [ret, setRet] = useState<RetFilter>("all");
  const [count, setCount] = useState<CountFilter>("all");
  const [hist, setHist] = useState<HistFilter>("all");
  const [sort, setSort] = useState<SortKey>("symbol");
  const [tab, setTab] = useState<Tab>("coins");
  const [pageSize, setPageSize] = useState(40);
  const [page, setPage] = useState(0);
  const [pin, setPin] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    let cancel = false;
    fetch("/data/full_market.json")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json() as Promise<Payload>;
      })
      .then((j) => {
        if (!cancel) setData(j);
      })
      .catch((e: unknown) => {
        if (!cancel) setErr(e instanceof Error ? e.message : "讀取失敗");
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [q, from, to, oi, ret, count, hist, sort, tab, pageSize, pin]);

  const view = useMemo(() => {
    if (!data) return null;
    const query = q.trim().toUpperCase();
    const coinOk = (c: Coin) => {
      if (pin && c.symbol !== pin) return false;
      if (query && !c.symbol.includes(query) && !c.base.toUpperCase().includes(query)) return false;
      if (oi === "pass" && !c.has_oi) return false;
      if (oi === "spot" && c.has_oi) return false;
      if (hist === "ok" && c.status !== "ok") return false;
      if (hist === "short" && c.status !== "short") return false;
      return true;
    };
    const rowOk = (r: Row) => {
      if (pin && r.symbol !== pin) return false;
      const day = r.time.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (oi === "pass" && r.rule !== "early_oi") return false;
      if (oi === "spot" && r.rule !== "early_no_oi") return false;
      if (!matchRet(r.ret_1d, ret)) return false;
      return true;
    };

    const bySym = new Map<string, Row[]>();
    const rows: Row[] = [];
    for (const r of data.rows) {
      if (!rowOk(r)) continue;
      const coin = data.coins.find((c) => c.symbol === r.symbol);
      if (coin && !coinOk(coin)) continue;
      if (!coin && query && !r.symbol.includes(query) && !r.base.toUpperCase().includes(query)) continue;
      rows.push(r);
      const list = bySym.get(r.symbol);
      if (list) list.push(r);
      else bySym.set(r.symbol, [r]);
    }

    const aggs: Agg[] = [];
    for (const c of data.coins) {
      if (!coinOk(c)) continue;
      const list = bySym.get(c.symbol) ?? [];
      if (!countOk(list.length, count)) continue;
      const r1d = list.map((x) => x.ret_1d).filter((x): x is number => x != null);
      const r4 = list.map((x) => x.ret_4h).filter((x): x is number => x != null);
      const up = list.map((x) => x.max_up).filter((x): x is number => x != null);
      const dn = list.map((x) => x.max_dn).filter((x): x is number => x != null);
      const wins = r1d.filter((x) => x > 0).length;
      aggs.push({
        ...c,
        n: list.length,
        n1d: r1d.length,
        med4: median(r4),
        med1d: median(r1d),
        win1d: r1d.length ? wins / r1d.length : null,
        medUp: median(up),
        medDn: median(dn),
      });
    }

    aggs.sort((a, b) => {
      if (sort === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sort === "n") return b.n - a.n || a.symbol.localeCompare(b.symbol);
      if (sort === "med1d") return numSort(b.med1d) - numSort(a.med1d) || a.symbol.localeCompare(b.symbol);
      if (sort === "med4") return numSort(b.med4) - numSort(a.med4) || a.symbol.localeCompare(b.symbol);
      return numSort(b.medUp) - numSort(a.medUp) || a.symbol.localeCompare(b.symbol);
    });

    const allowed = new Set(aggs.map((a) => a.symbol));
    const shownRows = rows.filter((r) => allowed.has(r.symbol));
    shownRows.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.symbol.localeCompare(b.symbol)));

    const all1d = shownRows.map((x) => x.ret_1d).filter((x): x is number => x != null);
    const wins = all1d.filter((x) => x > 0).length;
    return {
      aggs,
      rows: shownRows,
      med1d: median(all1d),
      win1d: all1d.length ? wins / all1d.length : null,
      n1d: all1d.length,
    };
  }, [data, q, from, to, oi, ret, count, hist, sort, pin]);

  function reset() {
    setQ("");
    setFrom("");
    setTo("");
    setOi("all");
    setRet("all");
    setCount("all");
    setHist("all");
    setSort("symbol");
    setPin(null);
    setPage(0);
  }

  function downloadCsv() {
    if (!view) return;
    const lines: string[] = [];
    if (tab === "coins") {
      lines.push("symbol,base,has_oi,status,bars,eval_days,events,median_ret_4h,median_ret_1d,win_1d,median_max_up,median_max_dn");
      for (const a of view.aggs) {
        lines.push(
          [
            a.symbol,
            a.base,
            a.has_oi ? 1 : 0,
            a.status,
            a.bars,
            a.eval_days ?? "",
            a.n,
            a.med4 ?? "",
            a.med1d ?? "",
            a.win1d ?? "",
            a.medUp ?? "",
            a.medDn ?? "",
          ].join(","),
        );
      }
    } else {
      lines.push(
        "time,symbol,base,rule,close,multiple,quiet_1h,quiet_4h,ret_bar,prior_24h,oi_1h,oi_z,ret_15m,ret_30m,ret_1h,ret_4h,ret_1d,max_up,max_dn",
      );
      for (const r of view.rows) {
        lines.push(
          [
            r.time,
            r.symbol,
            r.base,
            r.rule,
            r.close ?? "",
            r.multiple ?? "",
            r.quiet_1h ?? "",
            r.quiet_4h ?? "",
            r.ret_bar ?? "",
            r.prior_24h ?? "",
            r.oi_1h ?? "",
            r.oi_z ?? "",
            r.ret_15m ?? "",
            r.ret_30m ?? "",
            r.ret_1h ?? "",
            r.ret_4h ?? "",
            r.ret_1d ?? "",
            r.max_up ?? "",
            r.max_dn ?? "",
          ].join(","),
        );
      }
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tab === "coins" ? "backtest-coins.csv" : "backtest-events.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (err) return <p className="err">回測資料讀取失敗：{err}</p>;
  if (!data || !view) return <p className="note">正在載入全市場回測…</p>;

  const list = tab === "coins" ? view.aggs : view.rows;
  const size = pageSize <= 0 ? list.length || 1 : pageSize;
  const pages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * size;
  const slice = list.slice(start, start + size);

  return (
    <section className="explorer">
      <p className="note">{data.notes}</p>
      <div className="filters">
        <label className="field">
          幣別搜尋
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例如 SAGA、BTC"
            autoComplete="off"
          />
        </label>
        <label className="field">
          日期起（台北）
          <input type="date" value={from} min={data.window_start} max={data.window_end} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          日期迄（台北）
          <input type="date" value={to} min={data.window_start} max={data.window_end} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          合約 OI
          <select value={oi} onChange={(e) => setOi(e.target.value as OiFilter)}>
            <option value="all">全部</option>
            <option value="pass">有 OI、訊號通過</option>
            <option value="spot">無合約 OI（僅現貨）</option>
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
          訊號筆數
          <select value={count} onChange={(e) => setCount(e.target.value as CountFilter)}>
            <option value="all">全部（含 0 筆）</option>
            <option value="0">0 筆</option>
            <option value="1">1 筆以上</option>
            <option value="3">3 筆以上</option>
            <option value="5">5 筆以上</option>
          </select>
        </label>
        <label className="field">
          歷史長度
          <select value={hist} onChange={(e) => setHist(e.target.value as HistFilter)}>
            <option value="all">全部</option>
            <option value="ok">可評估（約 90 日）</option>
            <option value="short">歷史不足</option>
          </select>
        </label>
        <label className="field">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="symbol">代號 A→Z</option>
            <option value="n">訊號多→少</option>
            <option value="med1d">+1 日中位 高→低</option>
            <option value="med4">+4 時中位 高→低</option>
            <option value="medUp">最大漲中位 高→低</option>
          </select>
        </label>
      </div>

      <div className="toolbar">
        <div className="seg" role="tablist">
          <button type="button" className={tab === "coins" ? "on" : ""} onClick={() => setTab("coins")}>
            各幣 {view.aggs.length}
          </button>
          <button type="button" className={tab === "rows" ? "on" : ""} onClick={() => setTab("rows")}>
            單筆 {view.rows.length}
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
          <b>
            {view.aggs.length}
            <small> / {data.universe}</small>
          </b>
          <span>符合的幣</span>
        </div>
        <div className="card">
          <b>
            {view.rows.length}
            <small> / {data.events}</small>
          </b>
          <span>符合的訊號</span>
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
                <th className="left">OI</th>
                <th className="left">歷史</th>
                <th>K 線</th>
                <th>可評估日</th>
                <th>訊號</th>
                <th>+4 時中位</th>
                <th>+1 日中位</th>
                <th>+1 日上漲</th>
                <th>最大漲中位</th>
                <th>最大跌中位</th>
              </tr>
            </thead>
            <tbody>
              {(slice as Agg[]).map((a) => (
                <tr key={a.symbol} className={pin === a.symbol ? "pinned" : ""}>
                  <td className="left">
                    <button type="button" className="linkish" onClick={() => { setPin(a.symbol); setTab("rows"); }}>
                      {a.base}
                    </button>
                    <div className="sym">{a.symbol}</div>
                  </td>
                  <td className="left">{a.has_oi ? "有" : "無"}</td>
                  <td className="left">{a.status === "ok" ? "可評估" : "不足"}</td>
                  <td>{a.bars.toLocaleString("zh-Hant")}</td>
                  <td>{a.eval_days == null ? "—" : a.eval_days.toFixed(1)}</td>
                  <td>{a.n}</td>
                  <td className={cls(a.med4)}>{pct(a.med4)}</td>
                  <td className={cls(a.med1d)}>{pct(a.med1d)}</td>
                  <td>{a.win1d == null ? "—" : pct(a.win1d, 0)}</td>
                  <td className={cls(a.medUp)}>{pct(a.medUp)}</td>
                  <td className={cls(a.medDn)}>{pct(a.medDn)}</td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td className="left" colSpan={11}>
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
                <th className="left">發送（台北）</th>
                <th className="left">幣</th>
                <th className="left">規則</th>
                <th>收盤</th>
                <th>倍數</th>
                <th>OI z</th>
                <th>+15 分</th>
                <th>+1 時</th>
                <th>+4 時</th>
                <th>+1 日</th>
                <th>最大漲</th>
                <th>最大跌</th>
                {detail && (
                  <>
                    <th>安靜 1h</th>
                    <th>安靜 4h</th>
                    <th>當根</th>
                    <th>前 24h</th>
                    <th>OI 1h</th>
                    <th>+30 分</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {(slice as Row[]).map((r) => (
                <tr key={r.symbol + r.time}>
                  <td className="left">{r.time}</td>
                  <td className="left">
                    <button type="button" className="linkish" onClick={() => setPin(r.symbol)}>
                      {r.base}
                    </button>
                  </td>
                  <td className="left">{r.rule === "early_oi" ? "OI 通過" : "僅現貨"}</td>
                  <td>{price(r.close)}</td>
                  <td>{r.multiple == null ? "—" : r.multiple.toFixed(1) + "×"}</td>
                  <td>{r.oi_z == null ? "—" : r.oi_z.toFixed(2)}</td>
                  <td className={cls(r.ret_15m)}>{pct(r.ret_15m)}</td>
                  <td className={cls(r.ret_1h)}>{pct(r.ret_1h)}</td>
                  <td className={cls(r.ret_4h)}>{pct(r.ret_4h)}</td>
                  <td className={cls(r.ret_1d)}>{pct(r.ret_1d)}</td>
                  <td className={cls(r.max_up)}>{pct(r.max_up)}</td>
                  <td className={cls(r.max_dn)}>{pct(r.max_dn)}</td>
                  {detail && (
                    <>
                      <td>{r.quiet_1h == null ? "—" : r.quiet_1h.toFixed(2)}</td>
                      <td>{r.quiet_4h == null ? "—" : r.quiet_4h.toFixed(2)}</td>
                      <td className={cls(r.ret_bar)}>{pct(r.ret_bar)}</td>
                      <td className={cls(r.prior_24h)}>{pct(r.prior_24h)}</td>
                      <td className={cls(r.oi_1h)}>{pct(r.oi_1h)}</td>
                      <td className={cls(r.ret_30m)}>{pct(r.ret_30m)}</td>
                    </>
                  )}
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td className="left" colSpan={detail ? 18 : 12}>
                    沒有符合的單筆。選「0 筆」時只會出現在各幣表。
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
        點幣別會鎖定該檔並切到單筆。報酬是相對警報收盤；最大漲／跌是之後路徑極值，不是出場價。名義 $100 的金額可把百分比直接看成美元。
        窗口 {data.window_start} → {data.window_end}（台北）。
      </p>
    </section>
  );
}
