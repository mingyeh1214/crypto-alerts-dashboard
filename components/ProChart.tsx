"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_PREFS,
  PANE_LABEL,
  loadPrefs,
  savePrefs,
  type ChartPrefs,
  type PaneKey,
} from "@/lib/chartPrefs";
import { atr, bollinger, ema, kdj, macd, rsi, sma, taker, vwapTaipei, type Bar } from "@/lib/indicators";
import { MARK_COLOR, STATUS_LABEL, type Burst } from "@/lib/research";

export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type Market = "futures" | "spot";

export const INTERVALS: { key: Interval; label: string; ms: number }[] = [
  { key: "1m", label: "1分", ms: 60_000 },
  { key: "5m", label: "5分", ms: 300_000 },
  { key: "15m", label: "15分", ms: 900_000 },
  { key: "1h", label: "1時", ms: 3_600_000 },
  { key: "4h", label: "4時", ms: 14_400_000 },
  { key: "1d", label: "日", ms: 86_400_000 },
];
const STEP: Record<Interval, number> = Object.fromEntries(INTERVALS.map((i) => [i.key, i.ms])) as Record<Interval, number>;
const OI_PERIOD: Record<Interval, string> = { "1m": "5m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d" };
const RANGES: { label: string; ms: number }[] = [
  { label: "4時", ms: 4 * 3600_000 },
  { label: "1天", ms: 86_400_000 },
  { label: "3天", ms: 3 * 86_400_000 },
  { label: "1週", ms: 7 * 86_400_000 },
  { label: "1月", ms: 30 * 86_400_000 },
];

const TZ = 8 * 3600; // axis shows Taipei wall-clock time
const UP = "#3cbe88";
const DN = "#e36d6d";
const PAGE = 1000;
const REFRESH_MS = 15_000;
const M5 = 300_000;
const MAX_OLDER_LOADS = 8;

type Loaded = { bars: Bar[]; oi: Map<number, number>; prem: Map<number, number>; reachedStart: boolean };
type Reg = (c: Calc) => void;
type Calc = ReturnType<typeof makeCalc>;
type Status = { kind: "loading" } | { kind: "error"; msg: string } | { kind: "ready" };

const t = (sec: number) => (sec + TZ) as UTCTimestamp;
const fromT = (time: Time) => (time as number) - TZ;

function decimalsFor(px: number) {
  if (!Number.isFinite(px) || px <= 0) return 4;
  return Math.max(2, Math.min(8, Math.ceil(-Math.log10(px)) + 4));
}
function fmtNum(x: number | null | undefined, d = 2) {
  if (x == null || !Number.isFinite(x)) return "—";
  return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtCompact(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e9) return (x / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(2) + "K";
  return x.toFixed(a >= 10 ? 0 : 2);
}
function fmtPct(x: number | null | undefined, d = 2) {
  if (x == null || !Number.isFinite(x)) return "—";
  return (x > 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
}
function taipeiStr(sec: number, withDate = true) {
  const d = new Date((sec + TZ) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const hm = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return withDate ? `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${hm}` : hm;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

function makeCalc(bars: Bar[], prefs: ChartPrefs, oi: Map<number, number>, prem: Map<number, number>) {
  const close = bars.map((b) => b.close);
  const memo = new Map<string, unknown>();
  const once = <T,>(k: string, f: () => T): T => {
    if (!memo.has(k)) memo.set(k, f());
    return memo.get(k) as T;
  };
  return {
    bars,
    close,
    oi,
    prem,
    ma: (kind: "EMA" | "MA", n: number) => once(`ma${kind}${n}`, () => (kind === "EMA" ? ema(close, n) : sma(close, n))),
    bb: () => once("bb", () => bollinger(close, prefs.bb.period, prefs.bb.mult)),
    vwap: () => once("vwap", () => vwapTaipei(bars)),
    volMa: () => once("volMa", () => sma(bars.map((b) => b.volume), prefs.volMa)),
    rsi: () => once("rsi", () => rsi(close, prefs.rsiPeriod)),
    macd: () => once("macd", () => macd(close)),
    kdj: () => once("kdj", () => kdj(bars)),
    atr: () => once("atr", () => atr(bars)),
    taker: () => once("taker", () => taker(bars)),
  };
}

function line(c: Calc, xs: number[]) {
  return c.bars.map((b, i) => (Number.isFinite(xs[i]) ? { time: t(b.time), value: xs[i] } : { time: t(b.time) }));
}

/** Bar (open, seconds) of this interval that contains instant `ms`. */
function barOf(ms: number, step: number) {
  return Math.floor(ms / step) * step / 1000;
}

function mergeBars(a: Bar[], b: Bar[]) {
  const m = new Map<number, Bar>();
  for (const x of a) m.set(x.time, x);
  for (const x of b) m.set(x.time, x);
  return [...m.values()].sort((p, q) => p.time - q.time);
}

export type ProChartProps = {
  symbol: string;
  spotSymbol: string;
  signals: Burst[];
  focusMs: number | null;
  interval: Interval;
  market: Market;
  onInterval: (iv: Interval) => void;
  onMarket: (m: Market) => void;
  onFocus?: (ms: number) => void;
};

export function ProChart({ symbol, spotSymbol, signals, focusMs, interval, market, onInterval, onMarket, onFocus }: ProChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const regRef = useRef<Reg[]>([]);
  const dataRef = useRef<Loaded>({ bars: [], oi: new Map(), prem: new Map(), reachedStart: false });
  const idxRef = useRef<Map<number, number>>(new Map());
  const sigBarsRef = useRef<Map<number, Burst[]>>(new Map());
  const loadingOlderRef = useRef(false);
  const olderLoadsRef = useRef(0);
  const lastBuildLoadRef = useRef(-1);
  const hlineObjsRef = useRef<IPriceLine[]>([]);
  const pinnedRef = useRef(false);
  const toolRef = useRef<"none" | "hline">("none");

  const [prefs, setPrefsState] = useState<ChartPrefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [loadId, setLoadId] = useState(0);
  const [retry, setRetry] = useState(0);
  const [panel, setPanel] = useState(false);
  const [full, setFull] = useState(false);
  const [tool, setTool] = useState<"none" | "hline">("none");
  const [hlines, setHlines] = useState<number[]>([]);
  const [olderBusy, setOlderBusy] = useState(false);
  const [atStart, setAtStart] = useState(false);

  const step = STEP[interval];
  const sym = market === "spot" ? spotSymbol : symbol;
  const perp = market === "futures";
  const hlineKey = `sentinel.hlines.${symbol}`;
  const signalsKey = signals.map((s) => `${s.closeMs}:${s.status}`).join(",");

  useEffect(() => {
    setPrefsState(loadPrefs());
    setPrefsReady(true);
  }, []);
  const setPrefs = useCallback((f: (p: ChartPrefs) => ChartPrefs) => {
    setPrefsState((p) => {
      const n = f(p);
      savePrefs(n);
      return n;
    });
  }, []);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    try {
      const v = JSON.parse(window.localStorage.getItem(hlineKey) || "[]");
      setHlines(Array.isArray(v) ? v.filter((x) => typeof x === "number") : []);
    } catch {
      setHlines([]);
    }
  }, [hlineKey]);
  const storeHlines = useCallback(
    (xs: number[]) => {
      setHlines(xs);
      try {
        window.localStorage.setItem(hlineKey, JSON.stringify(xs));
      } catch {
        /* ignore */
      }
    },
    [hlineKey],
  );

  const oiUrl = useCallback(
    (from: number, to: number) => `/api/oi?symbol=${encodeURIComponent(symbol)}&period=${OI_PERIOD[interval]}&from=${from}&to=${to}`,
    [symbol, interval],
  );
  const klUrl = useCallback(
    (s: string, mkt: "futures" | "spot" | "premium", from: number, to: number) =>
      `/api/klines?symbol=${encodeURIComponent(s)}&interval=${interval}&market=${mkt}&from=${from}&to=${to}`,
    [interval],
  );

  // ---------------------------------------------------------------- load --
  useEffect(() => {
    const ac = new AbortController();
    setStatus({ kind: "loading" });
    setAtStart(false);
    olderLoadsRef.current = 0;
    (async () => {
      try {
        const now = Date.now();
        const anchor = focusMs ?? now;
        const liveEnd = Math.floor(now / step) * step + step; // stable for one bar -> CDN-cacheable
        const wantEnd = anchor + 300 * step;
        const to = wantEnd >= now ? liveEnd : Math.floor(wantEnd / step) * step;
        const from = to - (PAGE - 1) * step;
        // Only pull the extra series whose pane is on (keeps Binance weight down).
        const want = loadPrefs().panes;
        const [kl, oi, pr] = await Promise.all([
          getJson<{ candles: Bar[] }>(klUrl(sym, market, from, to), ac.signal),
          perp && want.oi ? getJson<{ points: { time: number; value: number }[] }>(oiUrl(from, to), ac.signal).catch(() => ({ points: [] })) : Promise.resolve({ points: [] }),
          perp && want.premium ? getJson<{ candles: Bar[] }>(klUrl(symbol, "premium", from, to), ac.signal).catch(() => ({ candles: [] })) : Promise.resolve({ candles: [] }),
        ]);
        if (ac.signal.aborted) return;
        if (!kl.candles.length) throw new Error(market === "spot" ? `現貨 ${sym} 沒有資料` : "這段時間沒有 K 線");
        dataRef.current = {
          bars: kl.candles,
          oi: new Map(oi.points.map((p) => [p.time, p.value])),
          prem: new Map(pr.candles.map((c) => [c.time, c.close])),
          reachedStart: kl.candles.length < PAGE - 5,
        };
        setAtStart(dataRef.current.reachedStart);
        setStatus({ kind: "ready" });
        setLoadId((x) => x + 1);
      } catch (e) {
        if (!ac.signal.aborted) setStatus({ kind: "error", msg: e instanceof Error ? e.message : "讀取失敗" });
      }
    })();
    return () => ac.abort();
  }, [sym, symbol, market, perp, step, focusMs, retry, klUrl, oiUrl]);

  // Turning on OI / premium after the first load: reload so the series gets fetched.
  useEffect(() => {
    if (status.kind !== "ready" || !perp) return;
    const d = dataRef.current;
    if ((prefs.panes.oi && d.oi.size === 0) || (prefs.panes.premium && d.prem.size === 0)) setRetry((x) => x + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.panes.oi, prefs.panes.premium]);

  // ------------------------------------------------------- data -> series --
  const updateData = useCallback(() => {
    const d = dataRef.current;
    const idx = new Map<number, number>();
    d.bars.forEach((b, i) => idx.set(b.time, i));
    idxRef.current = idx;
    const c = makeCalc(d.bars, prefs, d.oi, d.prem);
    for (const r of regRef.current) r(c);
    // Signal markers, mapped onto this interval's bars.
    const byBar = new Map<number, Burst[]>();
    const marks: SeriesMarker<Time>[] = [];
    for (const s of signals) {
      const bb = barOf(s.closeMs - 1, step);
      const db = barOf(s.closeMs + 3 * M5 - 1, step);
      if (!idx.has(bb)) continue;
      byBar.set(bb, [...(byBar.get(bb) ?? []), s]);
      const col = MARK_COLOR[s.status];
      const focus = s.closeMs === focusMs;
      marks.push({ time: t(bb), position: "belowBar", color: col, shape: "arrowUp", text: focus ? "爆量●" : "爆量", size: focus ? 1.6 : 1 });
      if (db !== bb && idx.has(db)) marks.push({ time: t(db), position: "aboveBar", color: col, shape: "arrowDown", text: "判斷" });
    }
    marks.sort((a, b) => (a.time as number) - (b.time as number));
    sigBarsRef.current = byBar;
    markersRef.current?.setMarkers(marks);
    const last = d.bars[d.bars.length - 1];
    if (last && candleRef.current) {
      const dec = decimalsFor(last.close);
      candleRef.current.applyOptions({ priceFormat: { type: "price", precision: dec, minMove: 10 ** -dec } });
    }
  }, [prefs, signals, step, focusMs]);

  const legendHtml = useCallback(
    (i: number) => {
      const d = dataRef.current;
      const b = d.bars[i];
      if (!b) return "";
      const prev = d.bars[i - 1];
      const dec = decimalsFor(b.close);
      const chg = prev ? b.close / prev.close - 1 : b.close / b.open - 1;
      const amp = prev ? (b.high - b.low) / prev.close : (b.high - b.low) / b.open;
      const col = b.close >= b.open ? UP : DN;
      const c = makeCalcCached(i);
      const parts: string[] = [];
      parts.push(
        `<span class="lg-t">${taipeiStr(b.time)}</span>` +
          `<span>開 <b style="color:${col}">${fmtNum(b.open, dec)}</b></span>` +
          `<span>高 <b style="color:${col}">${fmtNum(b.high, dec)}</b></span>` +
          `<span>低 <b style="color:${col}">${fmtNum(b.low, dec)}</b></span>` +
          `<span>收 <b style="color:${col}">${fmtNum(b.close, dec)}</b></span>` +
          `<span>漲跌 <b style="color:${chg >= 0 ? UP : DN}">${fmtPct(chg)}</b></span>` +
          `<span>振幅 <b>${fmtPct(amp).replace("+", "")}</b></span>` +
          `<span>量 <b>${fmtCompact(b.volume)}</b> 幣</span>`,
      );
      const ov: string[] = [];
      prefs.ma.forEach((m) => {
        if (m.on) ov.push(`<span style="color:${m.color}">${m.kind}${m.period} ${fmtNum(c.ma(m.kind, m.period)[i], dec)}</span>`);
      });
      if (prefs.vwap && interval !== "1d") ov.push(`<span style="color:#e36dc4">VWAP ${fmtNum(c.vwap()[i], dec)}</span>`);
      if (prefs.bb.on) {
        const bb = c.bb();
        ov.push(`<span style="color:#7f8ea3">BB ${fmtNum(bb.up[i], dec)} / ${fmtNum(bb.mid[i], dec)} / ${fmtNum(bb.dn[i], dec)}</span>`);
      }
      const sub: string[] = [];
      const p = prefs.panes;
      if (p.volume) sub.push(`<span>量MA${prefs.volMa} ${fmtCompact(c.volMa()[i])}</span>`);
      if (p.oi && perp) {
        // The forming bar has no OI print yet: show the latest one at or before it.
        let v = d.oi.get(b.time);
        for (let k = 1; v == null && k <= 3; k++) v = d.oi.get(b.time - k * 300);
        sub.push(`<span style="color:#5aa9e4">未平倉 ${fmtCompact(v)}</span>`);
      }
      if (p.taker) {
        const tk = c.taker();
        sub.push(`<span>主動買賣比 ${fmtNum(tk.ratio[i], 3)} · 淨額 ${fmtCompact(tk.net[i])}</span>`);
      }
      if (p.rsi) sub.push(`<span style="color:#e4b15a">RSI${prefs.rsiPeriod} ${fmtNum(c.rsi()[i], 1)}</span>`);
      if (p.macd) {
        const m = c.macd();
        sub.push(`<span>MACD <i style="color:#5aa9e4">${fmtNum(m.dif[i], dec)}</i> <i style="color:#e4b15a">${fmtNum(m.dea[i], dec)}</i> ${fmtNum(m.hist[i], dec)}</span>`);
      }
      if (p.kdj) {
        const k = c.kdj();
        sub.push(`<span>KDJ <i style="color:#e4b15a">${fmtNum(k.k[i], 1)}</i> <i style="color:#5aa9e4">${fmtNum(k.d[i], 1)}</i> <i style="color:#e36dc4">${fmtNum(k.j[i], 1)}</i></span>`);
      }
      if (p.atr) sub.push(`<span>ATR14 ${fmtNum(c.atr()[i], dec)}</span>`);
      if (p.premium && perp) sub.push(`<span>溢價 ${fmtPct(d.prem.get(b.time), 3)}</span>`);
      return `<div class="lg-row">${parts.join("")}</div>` + (ov.length ? `<div class="lg-row">${ov.join("")}</div>` : "") + (sub.length ? `<div class="lg-row lg-sub">${sub.join("")}</div>` : "");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, interval, perp],
  );
  // Indicator cache for the legend (rebuilt whenever data/prefs change).
  const calcCache = useRef<{ key: string; c: Calc | null }>({ key: "", c: null });
  function makeCalcCached(_i: number): Calc {
    const d = dataRef.current;
    const key = `${d.bars.length}:${d.bars[d.bars.length - 1]?.time}:${d.bars[d.bars.length - 1]?.close}:${JSON.stringify(prefs)}`;
    if (calcCache.current.key !== key || !calcCache.current.c) calcCache.current = { key, c: makeCalc(d.bars, prefs, d.oi, d.prem) };
    return calcCache.current.c!;
  }

  const showLegend = useCallback(
    (i?: number) => {
      if (!legendRef.current) return;
      const n = dataRef.current.bars.length;
      legendRef.current.innerHTML = legendHtml(i ?? n - 1);
    },
    [legendHtml],
  );

  const showTip = useCallback((list: Burst[] | null, x: number, y: number) => {
    const el = tipRef.current;
    if (!el) return;
    if (!list || !list.length) {
      el.style.display = "none";
      return;
    }
    el.innerHTML = list
      .map(
        (s) =>
          `<div class="tip-h"><b style="color:${MARK_COLOR[s.status]}">${STATUS_LABEL[s.status]}</b> · ${s.symbol} · ${s.source === "live" ? "線上" : "回測"}</div>` +
          `<div>爆量收盤 ${taipeiStr(s.closeMs / 1000)}</div>` +
          `<div>漲幅 ${fmtPct(s.ret)} · 相對量 ${s.rvol == null ? "—" : s.rvol.toFixed(1)}</div>` +
          `<div>主動買賣比 ${s.taker == null ? "—" : s.taker.toFixed(3)} · 未平倉 ${fmtPct(s.oiChg)}</div>` +
          `<div>觀察窗 p ${s.obsP == null ? "—" : s.obsP.toFixed(4)}${s.r4h != null ? ` · 事後4h ${fmtPct(s.r4h)}` : ""}</div>`,
      )
      .join('<hr/>');
    const host = hostRef.current;
    const w = host?.clientWidth ?? 600;
    el.style.display = "block";
    el.style.left = `${Math.min(Math.max(8, x + 14), w - 250)}px`;
    el.style.top = `${Math.max(8, y - 40)}px`;
  }, []);

  const resetView = useCallback(() => {
    const ch = chartRef.current;
    const d = dataRef.current;
    if (!ch || !d.bars.length) return;
    const n = d.bars.length;
    let i = n - 1;
    if (focusMs != null) {
      const fb = barOf(focusMs - 1, step);
      const fi = idxRef.current.get(fb);
      if (fi != null) i = fi;
      else if (fb > d.bars[n - 1].time) i = n - 1;
    }
    // ~150 bars: 50 before the signal and up to 100 after it, never far past the last bar.
    const to = Math.min(i + 100, n + 5);
    ch.timeScale().setVisibleLogicalRange({ from: Math.min(i - 50, to - 150), to });
  }, [focusMs, step]);

  // --------------------------------------------------------- older bars --
  const loadOlder = useCallback(async () => {
    const d = dataRef.current;
    if (loadingOlderRef.current || d.reachedStart || !d.bars.length) return 0;
    loadingOlderRef.current = true;
    setOlderBusy(true);
    try {
      const first = d.bars[0].time * 1000;
      const to = first - step;
      const from = to - (PAGE - 1) * step;
      const [kl, oi, pr] = await Promise.all([
        getJson<{ candles: Bar[] }>(klUrl(sym, market, from, to)),
        perp && prefs.panes.oi ? getJson<{ points: { time: number; value: number }[] }>(oiUrl(from, to)).catch(() => ({ points: [] })) : Promise.resolve({ points: [] }),
        perp && prefs.panes.premium ? getJson<{ candles: Bar[] }>(klUrl(symbol, "premium", from, to)).catch(() => ({ candles: [] })) : Promise.resolve({ candles: [] }),
      ]);
      const cur = dataRef.current;
      if (cur !== d) return 0;
      const add = kl.candles.filter((b) => b.time < cur.bars[0].time);
      if (!add.length) {
        cur.reachedStart = true;
        setAtStart(true);
        return 0;
      }
      const ts = chartRef.current?.timeScale();
      const r = ts?.getVisibleLogicalRange();
      cur.bars = mergeBars(add, cur.bars);
      for (const p of oi.points) cur.oi.set(p.time, p.value);
      for (const c of pr.candles) cur.prem.set(c.time, c.close);
      if (kl.candles.length < PAGE - 5) {
        cur.reachedStart = true;
        setAtStart(true);
      }
      updateData();
      if (ts && r) ts.setVisibleLogicalRange({ from: r.from + add.length, to: r.to + add.length });
      return add.length;
    } catch {
      return 0;
    } finally {
      loadingOlderRef.current = false;
      setOlderBusy(false);
    }
  }, [step, klUrl, oiUrl, sym, symbol, market, perp, prefs.panes.oi, prefs.panes.premium, updateData]);

  // ------------------------------------------------------------- build --
  useEffect(() => {
    if (status.kind !== "ready" || !prefsReady || !hostRef.current) return;
    const keepRange = lastBuildLoadRef.current === loadId && chartRef.current;
    const prevRange = keepRange ? chartRef.current!.timeScale().getVisibleRange() : null;
    chartRef.current?.remove();
    chartRef.current = null;
    lastBuildLoadRef.current = loadId;

    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#131922" },
        textColor: "#93a0b0",
        fontFamily: '"IBM Plex Sans", "Noto Sans TC", sans-serif',
        panes: { separatorColor: "#2a3544", separatorHoverColor: "#3d4d62", enableResize: true },
        attributionLogo: true,
      },
      grid: { vertLines: { color: "#1f2a37" }, horzLines: { color: "#1f2a37" } },
      rightPriceScale: { borderColor: "#2a3544" },
      timeScale: { borderColor: "#2a3544", timeVisible: interval !== "1d", secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: "zh-TW" },
    });
    chartRef.current = chart;
    const reg: Reg[] = [];

    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP, downColor: DN, borderUpColor: UP, borderDownColor: DN, wickUpColor: UP, wickDownColor: DN,
      priceLineVisible: true, lastValueVisible: true,
    });
    candleRef.current = candle;
    chart.priceScale("right").applyOptions({
      mode: prefs.scale === "log" ? PriceScaleMode.Logarithmic : prefs.scale === "percent" ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
    });
    reg.push((c) => candle.setData(c.bars.map((b) => ({ time: t(b.time), open: b.open, high: b.high, low: b.low, close: b.close }))));
    markersRef.current = createSeriesMarkers(candle, []);

    const overlay = (color: string, width: 1 | 2 = 1, style: LineStyle = LineStyle.Solid) =>
      chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    for (const m of prefs.ma) {
      if (!m.on) continue;
      const s = overlay(m.color);
      reg.push((c) => s.setData(line(c, c.ma(m.kind, m.period))));
    }
    if (prefs.bb.on) {
      const u = overlay("#7f8ea3");
      const mid = overlay("#7f8ea3", 1, LineStyle.Dashed);
      const dn = overlay("#7f8ea3");
      reg.push((c) => {
        const b = c.bb();
        u.setData(line(c, b.up));
        mid.setData(line(c, b.mid));
        dn.setData(line(c, b.dn));
      });
    }
    if (prefs.vwap && interval !== "1d") {
      const s = overlay("#e36dc4", 1, LineStyle.Dotted);
      reg.push((c) => s.setData(line(c, c.vwap())));
    }

    let pane = 0;
    const panes: number[] = [];
    const p = prefs.panes;
    const sub = (key: PaneKey) => {
      pane += 1;
      panes.push(pane);
      void key;
      return pane;
    };
    if (p.volume) {
      const i = sub("volume");
      const v = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, i);
      const ma = chart.addSeries(LineSeries, { color: "#e4b15a", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: { type: "volume" } }, i);
      reg.push((c) => {
        const sb = sigBarsRef.current;
        v.setData(
          c.bars.map((b) => {
            const sg = sb.get(b.time);
            return {
              time: t(b.time),
              value: b.volume,
              color: sg ? MARK_COLOR[sg[sg.length - 1].status] : b.close >= b.open ? "rgba(60,190,136,0.4)" : "rgba(227,109,109,0.4)",
            };
          }),
        );
        ma.setData(line(c, c.volMa()));
      });
    }
    if (p.oi && perp) {
      const i = sub("oi");
      const s = chart.addSeries(LineSeries, { color: "#5aa9e4", lineWidth: 2, priceLineVisible: false, priceFormat: { type: "volume" } }, i);
      reg.push((c) => s.setData(c.bars.filter((b) => c.oi.has(b.time)).map((b) => ({ time: t(b.time), value: c.oi.get(b.time)! }))));
    }
    if (p.taker) {
      const i = sub("taker");
      const s = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "volume" } }, i);
      reg.push((c) => {
        const tk = c.taker();
        s.setData(c.bars.map((b, k) => ({ time: t(b.time), value: tk.net[k], color: tk.net[k] >= 0 ? "rgba(60,190,136,0.7)" : "rgba(227,109,109,0.7)" })));
      });
    }
    if (p.rsi) {
      const i = sub("rsi");
      const s = chart.addSeries(LineSeries, { color: "#e4b15a", lineWidth: 1, priceLineVisible: false }, i);
      s.createPriceLine({ price: 70, color: "#5a6676", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      s.createPriceLine({ price: 30, color: "#5a6676", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      reg.push((c) => s.setData(line(c, c.rsi())));
    }
    if (p.macd) {
      const i = sub("macd");
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, i);
      const dif = chart.addSeries(LineSeries, { color: "#5aa9e4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, i);
      const dea = chart.addSeries(LineSeries, { color: "#e4b15a", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, i);
      reg.push((c) => {
        const m = c.macd();
        h.setData(c.bars.map((b, k) => (Number.isFinite(m.hist[k]) ? { time: t(b.time), value: m.hist[k], color: m.hist[k] >= 0 ? "rgba(60,190,136,0.6)" : "rgba(227,109,109,0.6)" } : { time: t(b.time) })));
        dif.setData(line(c, m.dif));
        dea.setData(line(c, m.dea));
      });
    }
    if (p.kdj) {
      const i = sub("kdj");
      const k = chart.addSeries(LineSeries, { color: "#e4b15a", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, i);
      const d = chart.addSeries(LineSeries, { color: "#5aa9e4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, i);
      const j = chart.addSeries(LineSeries, { color: "#e36dc4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, i);
      reg.push((c) => {
        const x = c.kdj();
        k.setData(line(c, x.k));
        d.setData(line(c, x.d));
        j.setData(line(c, x.j));
      });
    }
    if (p.atr) {
      const i = sub("atr");
      const s = chart.addSeries(LineSeries, { color: "#b07ae4", lineWidth: 1, priceLineVisible: false }, i);
      reg.push((c) => s.setData(line(c, c.atr())));
    }
    if (p.premium && perp) {
      const i = sub("premium");
      const s = chart.addSeries(LineSeries, { color: "#e36dc4", lineWidth: 1, priceLineVisible: false, priceFormat: { type: "percent", precision: 3 } }, i);
      s.createPriceLine({ price: 0, color: "#5a6676", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      reg.push((c) => s.setData(c.bars.filter((b) => c.prem.has(b.time)).map((b) => ({ time: t(b.time), value: c.prem.get(b.time)! * 100 }))));
    }
    regRef.current = reg;
    // Main pane ~5.5x a sub-pane; the stage grows with the number of sub-panes (CSS --panes).
    chart.panes().forEach((pn, k) => pn.setStretchFactor(k === 0 ? 5.5 : 1));

    updateData();
    hlineObjsRef.current = [];

    if (prevRange) chart.timeScale().setVisibleRange(prevRange);
    else resetView();
    showLegend();

    chart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        showLegend();
        if (!pinnedRef.current) showTip(null, 0, 0);
        return;
      }
      const sec = fromT(param.time);
      const i = idxRef.current.get(sec);
      showLegend(i);
      if (!pinnedRef.current) showTip(sigBarsRef.current.get(sec) ?? null, param.point.x, param.point.y);
    });
    chart.subscribeClick((param: MouseEventParams<Time>) => {
      if (toolRef.current === "hline" && param.point) {
        const price = candle.coordinateToPrice(param.point.y);
        if (price != null) {
          setHlinesFromChart((xs) => [...xs, Number(price)]);
          setTool("none");
        }
        return;
      }
      const sec = param.time ? fromT(param.time) : null;
      const list = sec != null ? sigBarsRef.current.get(sec) : undefined;
      if (list && param.point) {
        pinnedRef.current = true;
        showTip(list, param.point.x, param.point.y);
        const s = list[list.length - 1];
        if (s.closeMs !== focusMs) onFocus?.(s.closeMs);
      } else {
        pinnedRef.current = false;
        showTip(null, 0, 0);
      }
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (r && r.from < 30 && olderLoadsRef.current < 50) {
        olderLoadsRef.current += 1;
        void loadOlder();
      }
    });
    return () => {
      /* chart is removed on the next build or unmount */
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind, loadId, prefs, prefsReady, interval, perp, signalsKey]);

  const setHlinesFromChart = (f: (xs: number[]) => number[]) => {
    setHlines((xs) => {
      const n = f(xs);
      try {
        window.localStorage.setItem(hlineKey, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  };

  // Horizontal lines (drawn after every build).
  useEffect(() => {
    const s = candleRef.current;
    if (!s || status.kind !== "ready") return;
    for (const l of hlineObjsRef.current) {
      try {
        s.removePriceLine(l);
      } catch {
        /* series replaced */
      }
    }
    hlineObjsRef.current = hlines.map((price) =>
      s.createPriceLine({ price, color: "#e4b15a", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" }),
    );
  }, [hlines, loadId, prefs, status.kind, signalsKey]);

  useEffect(() => () => {
    chartRef.current?.remove();
    chartRef.current = null;
  }, []);

  // ------------------------------------------------------- auto refresh --
  useEffect(() => {
    if (status.kind !== "ready") return;
    let tick = 0;
    const id = setInterval(async () => {
      const d = dataRef.current;
      const last = d.bars[d.bars.length - 1];
      if (!last || document.hidden) return;
      const now = Date.now();
      if (last.time * 1000 < now - 3 * step) return; // viewing history: nothing to refresh
      tick += 1;
      try {
        const to = Math.floor(now / step) * step + step;
        const from = last.time * 1000;
        const [kl, oi, pr] = await Promise.all([
          getJson<{ candles: Bar[] }>(klUrl(sym, market, from, to)),
          perp && prefs.panes.oi && tick % 4 === 0
            ? getJson<{ points: { time: number; value: number }[] }>(oiUrl(from - 6 * STEP["5m"], to)).catch(() => ({ points: [] }))
            : Promise.resolve({ points: [] }),
          perp && prefs.panes.premium && tick % 4 === 0 ? getJson<{ candles: Bar[] }>(klUrl(symbol, "premium", from, to)).catch(() => ({ candles: [] })) : Promise.resolve({ candles: [] }),
        ]);
        if (dataRef.current !== d || !kl.candles.length) return;
        d.bars = mergeBars(d.bars, kl.candles);
        for (const p of oi.points) d.oi.set(p.time, p.value);
        for (const c of pr.candles) d.prem.set(c.time, c.close);
        updateData();
        showLegend();
      } catch {
        /* keep the last good data */
      }
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [status.kind, loadId, step, sym, symbol, market, perp, prefs.panes.oi, prefs.panes.premium, klUrl, oiUrl, updateData, showLegend]);

  // ------------------------------------------------------------ actions --
  const zoom = (f: number) => {
    const ts = chartRef.current?.timeScale();
    const r = ts?.getVisibleLogicalRange();
    if (!ts || !r) return;
    const mid = (r.from + r.to) / 2;
    const half = ((r.to - r.from) / 2) * f;
    ts.setVisibleLogicalRange({ from: mid - half, to: mid + half });
  };
  const latest = () => chartRef.current?.timeScale().scrollToRealTime();
  const preset = async (ms: number) => {
    const d = dataRef.current;
    const ch = chartRef.current;
    if (!ch || !d.bars.length) return;
    const lastSec = d.bars[d.bars.length - 1].time;
    const fromSec = lastSec - ms / 1000;
    let loops = 0;
    while (dataRef.current.bars[0].time > fromSec && !dataRef.current.reachedStart && loops < MAX_OLDER_LOADS) {
      loops += 1;
      const n = await loadOlder();
      if (!n) break;
    }
    const first = dataRef.current.bars[0].time;
    ch.timeScale().setVisibleRange({ from: t(Math.max(first, fromSec)), to: t(lastSec) });
  };
  const toggleFull = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => setFull((x) => !x));
    else setFull((x) => !x);
  };
  useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const screenshot = () => {
    const ch = chartRef.current;
    if (!ch) return;
    const canvas = ch.takeScreenshot();
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${sym}_${interval}_${taipeiStr(Date.now() / 1000).replace(/[/: ]/g, "")}.png`;
    a.click();
  };

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "f") toggleFull();
      else if (k === "r") resetView();
      else if (k === "l" || k === "end") latest();
      else if (k === "+" || k === "=") zoom(0.8);
      else if (k === "-") zoom(1.25);
      else if (k === "h") setTool((x) => (x === "hline" ? "none" : "hline"));
      else if (k === "escape") {
        setTool("none");
        setPanel(false);
      } else if (/^[1-6]$/.test(k)) onInterval(INTERVALS[Number(k) - 1].key);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetView, onInterval]);

  const paneCount = useMemo(
    () => (Object.keys(prefs.panes) as PaneKey[]).filter((k) => prefs.panes[k] && (perp || (k !== "oi" && k !== "premium"))).length,
    [prefs.panes, perp],
  );
  const activeCount = useMemo(
    () => prefs.ma.filter((m) => m.on).length + Number(prefs.bb.on) + Number(prefs.vwap) + Object.values(prefs.panes).filter(Boolean).length,
    [prefs],
  );

  return (
    <div ref={wrapRef} className={`pro-chart${full ? " is-full" : ""}`}>
      <div className="pc-bar">
        <div className="seg pc-iv" role="group" aria-label="週期">
          {INTERVALS.map((iv) => (
            <button key={iv.key} className={interval === iv.key ? "on" : ""} onClick={() => onInterval(iv.key)}>
              {iv.label}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="市場">
          <button className={perp ? "on" : ""} onClick={() => onMarket("futures")}>合約</button>
          <button className={!perp ? "on" : ""} onClick={() => onMarket("spot")}>現貨</button>
        </div>
        <div className="pc-ranges">
          {RANGES.map((r) => (
            <button key={r.label} className="btn sm" onClick={() => void preset(r.ms)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="pc-tools">
          <button className={`btn sm${panel ? " on" : ""}`} onClick={() => setPanel((x) => !x)} aria-expanded={panel}>
            指標 <small>{activeCount}</small>
          </button>
          <select
            className="pc-select"
            value={prefs.scale}
            onChange={(e) => setPrefs((p) => ({ ...p, scale: e.target.value as ChartPrefs["scale"] }))}
            aria-label="價格座標"
          >
            <option value="normal">一般座標</option>
            <option value="log">對數座標</option>
            <option value="percent">百分比座標</option>
          </select>
          <button className={`btn sm${tool === "hline" ? " on" : ""}`} title="水平線（H）：點圖上的價格" onClick={() => setTool((x) => (x === "hline" ? "none" : "hline"))}>
            ─ 水平線
          </button>
          {hlines.length ? (
            <button className="btn sm" title="清除這個幣的水平線" onClick={() => storeHlines([])}>清線</button>
          ) : null}
          <button className="btn sm icon" title="放大（+）" onClick={() => zoom(0.8)}>＋</button>
          <button className="btn sm icon" title="縮小（-）" onClick={() => zoom(1.25)}>－</button>
          <button className="btn sm" title="重設視圖（R）" onClick={resetView}>重設</button>
          <button className="btn sm" title="跳到最新（L）" onClick={latest}>最新 ⇥</button>
          <button className="btn sm" title="全螢幕（F）" onClick={toggleFull}>{full ? "離開全螢幕" : "全螢幕"}</button>
          <button className="btn sm" title="下載 PNG" onClick={screenshot}>截圖</button>
        </div>
      </div>

      {panel ? (
        <IndicatorPanel prefs={prefs} perp={perp} setPrefs={setPrefs} onClose={() => setPanel(false)} />
      ) : null}

      <div
        className={`pc-stage${tool === "hline" ? " drawing" : ""}`}
        style={full ? undefined : ({ "--panes": paneCount } as CSSProperties)}
      >
        <div ref={legendRef} className="pc-legend" />
        <div ref={tipRef} className="pc-tip" />
        <div ref={hostRef} className="pc-host" />
        {status.kind === "loading" ? (
          <div className="pc-skeleton" aria-busy="true">
            <div className="sk-bars">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ height: `${20 + ((i * 37) % 55)}%` }} />)}</div>
            <span>載入 {sym} {INTERVALS.find((x) => x.key === interval)?.label} K 線…</span>
          </div>
        ) : null}
        {status.kind === "error" ? (
          <div className="chart-empty">
            <strong>讀不到 K 線</strong>
            <span>{status.msg}</span>
            <button className="btn" onClick={() => setRetry((x) => x + 1)}>重試</button>
          </div>
        ) : null}
        {olderBusy ? <div className="pc-older">載入更早的 K 線…</div> : null}
      </div>
      <div className="pc-foot">
        <span><i style={{ background: MARK_COLOR.passed }} />通過</span>
        <span><i style={{ background: MARK_COLOR.pending }} />觀察中</span>
        <span>↑爆量 ↓判斷（收盤後 15 分）· 移到標記上看指標、點一下固定</span>
        <span>{perp ? "合約" : "現貨"} · 量為幣數 · 台北時間 · 每 15 秒更新{atStart ? " · 已到最早資料" : " · 往左拖載入更早"}</span>
        <span className="pc-keys">快捷鍵：1–6 週期 · +/− 縮放 · R 重設 · L 最新 · F 全螢幕 · H 水平線</span>
      </div>
    </div>
  );
}

function IndicatorPanel({
  prefs,
  perp,
  setPrefs,
  onClose,
}: {
  prefs: ChartPrefs;
  perp: boolean;
  setPrefs: (f: (p: ChartPrefs) => ChartPrefs) => void;
  onClose: () => void;
}) {
  const num = (v: string, lo: number, hi: number, dflt: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  return (
    <div className="pc-panel" role="dialog" aria-label="指標設定">
      <div className="pc-panel-h">
        <strong>指標</strong>
        <span>
          <button className="btn sm" onClick={() => setPrefs(() => DEFAULT_PREFS)}>恢復預設</button>
          <button className="btn sm" onClick={onClose}>完成</button>
        </span>
      </div>
      <div className="pc-panel-grid">
        <fieldset>
          <legend>主圖</legend>
          {prefs.ma.map((m, i) => (
            <label key={i} className="pc-row">
              <input
                type="checkbox"
                checked={m.on}
                onChange={(e) => setPrefs((p) => ({ ...p, ma: p.ma.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)) }))}
              />
              <i className="sw" style={{ background: m.color }} />
              <select value={m.kind} onChange={(e) => setPrefs((p) => ({ ...p, ma: p.ma.map((x, k) => (k === i ? { ...x, kind: e.target.value as "EMA" | "MA" } : x)) }))}>
                <option value="EMA">EMA</option>
                <option value="MA">MA</option>
              </select>
              <input
                type="number"
                min={2}
                max={500}
                value={m.period}
                onChange={(e) => setPrefs((p) => ({ ...p, ma: p.ma.map((x, k) => (k === i ? { ...x, period: num(e.target.value, 2, 500, x.period) } : x)) }))}
              />
            </label>
          ))}
          <label className="pc-row">
            <input type="checkbox" checked={prefs.bb.on} onChange={(e) => setPrefs((p) => ({ ...p, bb: { ...p.bb, on: e.target.checked } }))} />
            <i className="sw" style={{ background: "#7f8ea3" }} />布林通道
            <input type="number" min={5} max={200} value={prefs.bb.period} onChange={(e) => setPrefs((p) => ({ ...p, bb: { ...p.bb, period: num(e.target.value, 5, 200, 20) } }))} />
            <input type="number" min={1} max={4} step={0.5} value={prefs.bb.mult} onChange={(e) => setPrefs((p) => ({ ...p, bb: { ...p.bb, mult: Math.max(0.5, Math.min(4, Number(e.target.value) || 2)) } }))} />
          </label>
          <label className="pc-row">
            <input type="checkbox" checked={prefs.vwap} onChange={(e) => setPrefs((p) => ({ ...p, vwap: e.target.checked }))} />
            <i className="sw" style={{ background: "#e36dc4" }} />VWAP（每日台北 00:00 重算，與規則相同）
          </label>
        </fieldset>
        <fieldset>
          <legend>副圖</legend>
          {(Object.keys(PANE_LABEL) as PaneKey[]).map((k) => {
            const perpOnly = k === "oi" || k === "premium";
            return (
              <label key={k} className={`pc-row${perpOnly && !perp ? " off" : ""}`}>
                <input
                  type="checkbox"
                  checked={prefs.panes[k]}
                  onChange={(e) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [k]: e.target.checked } }))}
                />
                {PANE_LABEL[k]}
                {k === "volume" ? (
                  <>
                    <small>MA</small>
                    <input type="number" min={2} max={200} value={prefs.volMa} onChange={(e) => setPrefs((p) => ({ ...p, volMa: num(e.target.value, 2, 200, 20) }))} />
                  </>
                ) : null}
                {k === "rsi" ? (
                  <input type="number" min={2} max={100} value={prefs.rsiPeriod} onChange={(e) => setPrefs((p) => ({ ...p, rsiPeriod: num(e.target.value, 2, 100, 14) }))} />
                ) : null}
                {k === "macd" ? <small>12/26/9</small> : null}
                {k === "kdj" ? <small>9/3/3</small> : null}
                {k === "atr" ? <small>14</small> : null}
                {k === "taker" ? <small>淨額（幣）</small> : null}
                {k === "oi" ? <small>{perp ? "近 30 天" : "僅合約"}</small> : null}
                {k === "premium" ? <small>{perp ? "%" : "僅合約"}</small> : null}
              </label>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
}
